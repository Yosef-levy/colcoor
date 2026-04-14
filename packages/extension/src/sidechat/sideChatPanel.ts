import * as vscode from "vscode";

import type { ColcoorApiClient, SideChatMessageOut } from "../api/client";
import { canMutateOwnSideChatUserMessage } from "./sideChatMessageActions";
import { mergeSideChatMessage } from "./mergeSideChatMessage";
import { maxSideChatSeq } from "./sideChatReadCursor";
import { toSideChatRenderMessages, type SideChatRenderMessage } from "./sideChatRenderMessages";
import { buildSideChatSendPayload } from "./sideChatSendPayload";
import { getSideChatWebviewHtml } from "./sideChatWebviewHtml";
import { sideChatSseReconnectDelayMs } from "./sideChatSseReconnectDelay";
import { trimmedSideChatSendBody } from "./trimSendBody";

function sleepAbortable(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const t = setTimeout(resolve, ms);
    const onAbort = (): void => {
      clearTimeout(t);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function randomNonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  for (let i = 0; i < 32; i++) {
    s += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return s;
}

type FromWebview =
  | { type: "ready" }
  | { type: "send"; text: string; referencedSideChatMessageId?: string | null }
  | { type: "refresh" }
  | { type: "edit"; messageId: string; text: string }
  | { type: "delete"; messageId: string };

type StateMessage = {
  type: "state";
  messages: SideChatRenderMessage[];
  /** Caller user id for author-only actions in the webview; null if profile could not be loaded. */
  viewerUserId: string | null;
};

type ErrorMessage = { type: "error"; text: string };

/**
 * Opens a webview panel listing side-chat messages with send, refresh, and SSE updates.
 */
export async function openSideChatPanel(
  _context: vscode.ExtensionContext,
  api: ColcoorApiClient,
  conversationId: string,
  title: string | null,
): Promise<void> {
  const label = title?.trim() ? title.trim() : `Side chat · ${conversationId.slice(0, 8)}…`;
  const nonce = randomNonce();
  const panel = vscode.window.createWebviewPanel(
    "colcoor.sideChat",
    label,
    vscode.ViewColumn.Beside,
    { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [_context.extensionUri] },
  );
  panel.webview.options = { enableScripts: true, localResourceRoots: [_context.extensionUri] };
  panel.webview.html = getSideChatWebviewHtml(panel.webview.cspSource, nonce);

  const ac = new AbortController();
  let cached: SideChatMessageOut[] = [];
  let lastStreamSeq = 0;
  let sseStarted = false;
  /** Increments after each failed stream; reset when the stream yields an event. */
  let sseReconnectAttempt = 0;
  let disposed = false;
  /** Last `last_read_seq` successfully PATCHed (avoids spamming the API). */
  let lastPatchedReadSeq = -1;
  let readPatchChain = Promise.resolve();
  /** Debounce refreshing the conversation list after read cursor updates (SSE can be chatty). */
  let listRefreshTimer: ReturnType<typeof setTimeout> | undefined;
  /** `undefined` = not loaded yet, `null` = load failed, string = user id */
  let myUserId: string | null | undefined = undefined;

  async function ensureMyUserId(): Promise<string | null> {
    if (myUserId !== undefined) {
      return myUserId;
    }
    try {
      const me = await api.getMe();
      myUserId = me.id;
    } catch {
      myUserId = null;
    }
    return myUserId;
  }

  function scheduleMarkRead(): void {
    readPatchChain = readPatchChain
      .then(async () => {
        if (disposed) {
          return;
        }
        const m = maxSideChatSeq(cached);
        if (m <= lastPatchedReadSeq) {
          return;
        }
        try {
          await api.patchSideChatRead(conversationId, m);
          lastPatchedReadSeq = m;
          if (listRefreshTimer !== undefined) {
            clearTimeout(listRefreshTimer);
          }
          listRefreshTimer = setTimeout(() => {
            listRefreshTimer = undefined;
            if (!disposed) {
              void vscode.commands.executeCommand("colcoor.refreshConversations");
            }
          }, 1500);
        } catch {
          /* ignore — badge / unread can catch up on next open */
        }
      })
      .catch(() => {
        /* never break the chain on unexpected rejection */
      });
  }

  async function postState(): Promise<void> {
    const viewerUserId = await ensureMyUserId();
    try {
      await panel.webview.postMessage({
        type: "state",
        messages: toSideChatRenderMessages(cached),
        viewerUserId,
      } satisfies StateMessage);
    } catch {
      /* webview gone */
    }
  }

  async function pushState(): Promise<void> {
    try {
      cached = await api.listSideChatMessages(conversationId, 0);
      lastStreamSeq = maxSideChatSeq(cached);
      await postState();
      scheduleMarkRead();
    } catch (e) {
      const t = e instanceof Error ? e.message : String(e);
      try {
        await panel.webview.postMessage({ type: "error", text: t } satisfies ErrorMessage);
      } catch {
        /* */
      }
    }
  }

  function startSseLoop(): void {
    const run = async () => {
      while (!disposed) {
        const startAfter = lastStreamSeq;
        try {
          for await (const ev of api.streamSideChatSseEvents(conversationId, {
            afterSeq: startAfter,
            signal: ac.signal,
          })) {
            sseReconnectAttempt = 0;
            const o = ev as { type?: string; message?: SideChatMessageOut };
            if (o?.type !== "side_chat" || !o.message) {
              continue;
            }
            cached = mergeSideChatMessage(cached, o.message);
            lastStreamSeq = Math.max(lastStreamSeq, o.message.seq);
            await postState();
            scheduleMarkRead();
          }
        } catch {
          /* aborted, fetch error, or stream read failure */
        }
        if (disposed || ac.signal.aborted) {
          break;
        }
        const delayMs = sideChatSseReconnectDelayMs(sseReconnectAttempt);
        sseReconnectAttempt = Math.min(sseReconnectAttempt + 1, 25);
        try {
          await sleepAbortable(delayMs, ac.signal);
        } catch {
          break;
        }
      }
    };
    void run();
  }

  panel.webview.onDidReceiveMessage(async (raw: unknown) => {
    const msg = raw as FromWebview;
    if (!msg || typeof msg !== "object" || !("type" in msg)) {
      return;
    }
    if (msg.type === "ready") {
      await pushState();
      if (!sseStarted) {
        sseStarted = true;
        startSseLoop();
      }
      return;
    }
    if (msg.type === "refresh") {
      await pushState();
      return;
    }
    if (msg.type === "send") {
      const payload = buildSideChatSendPayload(msg.text, msg.referencedSideChatMessageId, cached);
      if (!payload) {
        await panel.webview.postMessage({
          type: "error",
          text: "Message is empty.",
        } satisfies ErrorMessage);
        return;
      }
      try {
        await api.postSideChatMessage(conversationId, payload);
        await pushState();
      } catch (e) {
        const t = e instanceof Error ? e.message : String(e);
        await panel.webview.postMessage({ type: "error", text: t } satisfies ErrorMessage);
      }
      return;
    }
    if (msg.type === "edit") {
      const body = trimmedSideChatSendBody(msg.text);
      if (!body) {
        await panel.webview.postMessage({
          type: "error",
          text: "Edited message is empty.",
        } satisfies ErrorMessage);
        return;
      }
      const mid = typeof msg.messageId === "string" ? msg.messageId.trim() : "";
      if (!mid) {
        return;
      }
      const row = cached.find((m) => m.id === mid);
      const uid = await ensureMyUserId();
      if (!row || !canMutateOwnSideChatUserMessage(row, uid)) {
        await panel.webview.postMessage({
          type: "error",
          text: "You can only edit your own messages.",
        } satisfies ErrorMessage);
        return;
      }
      try {
        await api.patchSideChatMessage(conversationId, mid, { body });
        await pushState();
      } catch (e) {
        const t = e instanceof Error ? e.message : String(e);
        await panel.webview.postMessage({ type: "error", text: t } satisfies ErrorMessage);
      }
      return;
    }
    if (msg.type === "delete") {
      const mid = typeof msg.messageId === "string" ? msg.messageId.trim() : "";
      if (!mid) {
        return;
      }
      const row = cached.find((m) => m.id === mid);
      const uid = await ensureMyUserId();
      if (!row || !canMutateOwnSideChatUserMessage(row, uid)) {
        await panel.webview.postMessage({
          type: "error",
          text: "You can only delete your own messages.",
        } satisfies ErrorMessage);
        return;
      }
      try {
        await api.deleteSideChatMessage(conversationId, mid);
        await pushState();
      } catch (e) {
        const t = e instanceof Error ? e.message : String(e);
        await panel.webview.postMessage({ type: "error", text: t } satisfies ErrorMessage);
      }
    }
  });

  panel.onDidDispose(() => {
    disposed = true;
    if (listRefreshTimer !== undefined) {
      clearTimeout(listRefreshTimer);
      listRefreshTimer = undefined;
    }
    ac.abort();
    void vscode.commands.executeCommand("colcoor.refreshConversations");
  });
}
