import * as vscode from "vscode";

import type { ColcoorApiClient, SideChatMessageOut } from "../api/client";
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
 * Opens (or focuses) a webview panel listing side-chat messages with send + refresh.
 */
export async function openSideChatPanel(
  context: vscode.ExtensionContext,
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
    { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [context.extensionUri] },
  );
  panel.webview.options = { enableScripts: true, localResourceRoots: [context.extensionUri] };
  panel.webview.html = getSideChatWebviewHtml(panel.webview.cspSource, nonce);

  async function pushState(): Promise<void> {
    try {
      const messages = await api.listSideChatMessages(conversationId, 0);
      const msg: StateMessage = { type: "state", messages };
      await panel.webview.postMessage(msg);
    } catch (e) {
      const t = e instanceof Error ? e.message : String(e);
      await panel.webview.postMessage({ type: "error", text: t } satisfies ErrorMessage);
    }
  }

  panel.webview.onDidReceiveMessage(async (raw: unknown) => {
    const msg = raw as FromWebview;
    if (!msg || typeof msg !== "object" || !("type" in msg)) {
      return;
    }
    if (msg.type === "ready") {
      await pushState();
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
    /* panel closed */
  });
}
