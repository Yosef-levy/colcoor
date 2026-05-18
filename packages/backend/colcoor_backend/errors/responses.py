"""JSON error envelope for API responses."""

from __future__ import annotations

from typing import Any

from starlette.requests import Request
from starlette.responses import JSONResponse

from colcoor_backend.observability.middleware import REQUEST_ID_HEADER

_ERROR_KEY = "error"


def get_request_id(request: Request | None) -> str:
    if request is None:
        return ""
    rid = getattr(request.state, "request_id", None)
    if isinstance(rid, str) and rid.strip():
        return rid.strip()
    return ""


def error_body(*, code: str, message: str, request_id: str) -> dict[str, Any]:
    return {
        _ERROR_KEY: {
            "code": code,
            "message": message,
            "request_id": request_id,
        }
    }


def error_response(
    request: Request | None,
    *,
    status_code: int,
    code: str,
    message: str,
) -> JSONResponse:
    request_id = get_request_id(request)
    response = JSONResponse(
        status_code=status_code,
        content=error_body(code=code, message=message, request_id=request_id),
    )
    if request_id:
        response.headers[REQUEST_ID_HEADER] = request_id
    return response
