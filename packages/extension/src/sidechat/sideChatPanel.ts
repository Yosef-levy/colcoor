import * as vscode from "vscode";

import type { ColcoorApiClient, SideChatMessageOut } from "../api/client";
import { mergeSideChatMessage } from "./mergeSideChatMessage";
import { getSideChatWebviewHtml } from "./sideChatWebviewHtml";
import { trimmedSideChatSendBody } from "./trimSendBody";

function randomNonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  for (let i = 0; i < 32; i++) {
    s += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return s;
}

type FromWebview = { type: "ready" } | { type: "send"; text: string } | { type: "refresh" };

type StateMessage = {
  type: "state";
  messages: SideChatMessageOut[];
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

  async function postState(): Promise<void> {
    try {
      await panel.webview.postMessage({ type: "state", messages: cached } satisfies StateMessage);
    } catch {
      /* webview gone */
    }
  }

  async function pushState(): Promise<void> {
    try {
      cached = await api.listSideChatMessages(conversationId, 0);
      lastStreamSeq = cached.reduce((acc, m) => Math.max(acc, m.seq), 0);
      await postState();
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
      const startAfter = lastStreamSeq;
      try {
        for await (const ev of api.streamSideChatSseEvents(conversationId, {
          afterSeq: startAfter,
          signal: ac.signal,
        })) {
          const o = ev as { type?: string; message?: SideChatMessageOut };
          if (o?.type !== "side_chat" || !o.message) {
            continue;
          }
          cached = mergeSideChatMessage(cached, o.message);
          lastStreamSeq = Math.max(lastStreamSeq, o.message.seq);
          await postState();
        }
      } catch {
        /* aborted or network */
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
      const body = trimmedSideChatSendBody(msg.text);
      if (!body) {
        await panel.webview.postMessage({
          type: "error",
          text: "Message is empty.",
        } satisfies ErrorMessage);
        return;
      }
      try {
        await api.postSideChatMessage(conversationId, { kind: "user", body });
        await pushState();
      } catch (e) {
        const t = e instanceof Error ? e.message : String(e);
        await panel.webview.postMessage({ type: "error", text: t } satisfies ErrorMessage);
      }
    }
  });

  panel.onDidDispose(() => {
    ac.abort();
  });
}
