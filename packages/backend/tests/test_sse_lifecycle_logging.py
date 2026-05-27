"""SSE stream open/close lifecycle logs (Phase 0.1.4)."""

from __future__ import annotations

import asyncio
import json
import logging
import uuid
from unittest.mock import MagicMock

import pytest

from colcoor_backend.logging_config import JsonLogFormatter, set_log_env
from colcoor_backend.observability.sse_log_context import (
    SSE_DISCONNECT_TIMEOUT,
    SseStreamLogContext,
)
from colcoor_backend.services import side_chat_sse


class _CaptureHandler(logging.Handler):
    def __init__(self) -> None:
        super().__init__()
        self.setFormatter(JsonLogFormatter())
        self.lines: list[str] = []

    def emit(self, record: logging.LogRecord) -> None:
        self.lines.append(self.format(record))


def _stream_ctx() -> SseStreamLogContext:
    return SseStreamLogContext(
        request_id="req-sse-1",
        route="/api/v1/conversations/{conversation_id}/side-chat/stream",
        user_id=str(uuid.uuid4()),
        conversation_id=str(uuid.uuid4()),
        sse_attempt=1,
        sse_session="sess-test",
        reconnect=True,
        after_seq=5,
        method="GET",
    )


def test_sse_stream_close_timeout_logs_duration_and_reason(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("COLCOOR_SIDE_CHAT_SSE_MAX_SECONDS", "0.05")
    monkeypatch.setenv("COLCOOR_SIDE_CHAT_SSE_POLL_SEC", "0.01")
    monkeypatch.setenv("COLCOOR_SIDE_CHAT_SSE_DISABLE_NOTIFY", "1")
    set_log_env("production")

    async def _empty_poll(
        factory: object,
        *,
        conversation_id: uuid.UUID,
        user_id: uuid.UUID,
        last: int,
    ) -> tuple[list[bytes], int]:
        del factory, conversation_id, user_id
        return [], last

    monkeypatch.setattr(side_chat_sse, "_poll_and_yield", _empty_poll)

    handler = _CaptureHandler()
    log = logging.getLogger("colcoor_backend.services.side_chat_sse")
    log.handlers = [handler]
    log.setLevel(logging.INFO)
    log.propagate = False

    factory = MagicMock()
    conv = uuid.uuid4()
    uid = uuid.uuid4()
    ctx = _stream_ctx()

    async def _run() -> None:
        gen = side_chat_sse.iter_side_chat_sse(
            factory,
            wake_hub=None,
            conversation_id=conv,
            user_id=uid,
            after_seq=ctx.after_seq,
            stream_ctx=ctx,
        )
        async for _chunk in gen:
            pass

    asyncio.run(_run())

    close_lines = []
    for line in handler.lines:
        payload = json.loads(line)
        if payload.get("event_type") == "sse_stream_close":
            close_lines.append(payload)

    assert len(close_lines) == 1
    close = close_lines[0]
    assert close["message"] == "side-chat SSE stream closed"
    assert close["request_id"] == ctx.request_id
    assert close["conversation_id"] == ctx.conversation_id
    assert close["sse_disconnect_reason"] == SSE_DISCONNECT_TIMEOUT
    assert close["after_seq"] == ctx.after_seq
    assert close["last_seq"] == ctx.after_seq
    assert close["stream_duration_ms"] >= 0
    assert close["level"] == "INFO"
    assert "error" not in close


def test_sse_client_cancelled_logs_info_without_error_field(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("COLCOOR_SIDE_CHAT_SSE_DISABLE_NOTIFY", "1")
    set_log_env("production")

    async def _empty_poll(
        factory: object,
        *,
        conversation_id: uuid.UUID,
        user_id: uuid.UUID,
        last: int,
    ) -> tuple[list[bytes], int]:
        del factory, conversation_id, user_id
        return [], last

    monkeypatch.setattr(side_chat_sse, "_poll_and_yield", _empty_poll)

    handler = _CaptureHandler()
    log = logging.getLogger("colcoor_backend.services.side_chat_sse")
    log.handlers = [handler]
    log.setLevel(logging.INFO)
    log.propagate = False

    ctx = _stream_ctx()
    gen = side_chat_sse.iter_side_chat_sse(
        MagicMock(),
        wake_hub=None,
        conversation_id=uuid.uuid4(),
        user_id=uuid.uuid4(),
        after_seq=0,
        stream_ctx=ctx,
    )

    async def _consume() -> None:
        async for _chunk in gen:
            pass

    async def _run_cancel() -> None:
        task = asyncio.create_task(_consume())
        await asyncio.sleep(0.03)
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task

    asyncio.run(_run_cancel())

    close_events = [json.loads(ln) for ln in handler.lines if json.loads(ln).get("event_type") == "sse_stream_close"]
    assert len(close_events) == 1
    close = close_events[0]
    assert close["sse_disconnect_reason"] == "client_cancelled"
    assert close["level"] == "INFO"
    assert "error" not in close


def test_sse_error_logs_exc_info(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("COLCOOR_SIDE_CHAT_SSE_DISABLE_NOTIFY", "1")
    set_log_env("production")

    async def _boom_poll(
        factory: object,
        *,
        conversation_id: uuid.UUID,
        user_id: uuid.UUID,
        last: int,
    ) -> tuple[list[bytes], int]:
        del factory, conversation_id, user_id, last
        raise RuntimeError("sse poll failed")

    monkeypatch.setattr(side_chat_sse, "_poll_and_yield", _boom_poll)

    handler = _CaptureHandler()
    log = logging.getLogger("colcoor_backend.services.side_chat_sse")
    log.handlers = [handler]
    log.setLevel(logging.INFO)
    log.propagate = False

    ctx = _stream_ctx()
    gen = side_chat_sse.iter_side_chat_sse(
        MagicMock(),
        wake_hub=None,
        conversation_id=uuid.uuid4(),
        user_id=uuid.uuid4(),
        after_seq=0,
        stream_ctx=ctx,
    )

    async def _run_error() -> None:
        with pytest.raises(RuntimeError, match="sse poll failed"):
            async for _ in gen:
                pass

    asyncio.run(_run_error())

    close_events = [json.loads(ln) for ln in handler.lines if json.loads(ln).get("event_type") == "sse_stream_close"]
    assert len(close_events) == 1
    close = close_events[0]
    assert close["sse_disconnect_reason"] == "error"
    assert close["level"] == "ERROR"
    assert "error" in close
    assert "sse poll failed" in close["error"]
