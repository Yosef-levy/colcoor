import * as vscode from "vscode";
import type { AgentRunner } from "../agent/agentRunner";
import type { ColcoorApiClient, GraphEventNode } from "../api/client";
import { createAssistantStreamPusher } from "./assistantStreamWebview";
import { getConversationWebviewHtml } from "./conversationWebviewHtml";
import { runResendAssistant } from "./resendAssistant";
import { runColcoorUserTurn } from "./runUserTurn";
import {
  buildThreadSegments,
  extractAgentTraceEntries,
  type ThreadSegment,
} from "./threadSegments";
import { findBranchTip } from "./treeEvents";

type WebviewStateMessage = {
  type: "state";
  conversationId: string;
  title: string | null;
  conversationPinned: boolean;
  events: GraphEventNode[];
  selectedEventId: string;
  threadSegments: ThreadSegment[];
  busy: boolean;
  lastError: string | null;
};

/** Drop bulky `content_json` except CLI trace (webview only needs snippets + trace). */
function slimEventsForWebviewPostMessage(events: GraphEventNode[]): GraphEventNode[] {
  return events.map((e) => {
    const entries = extractAgentTraceEntries(e.content_json ?? undefined);
    const slimJson =
      entries && entries.length > 0
        ? { colcoor_agent_trace: { version: 1 as const, entries } }
        : null;
    return { ...e, content_json: slimJson };
  });
}

type FromWebview =
  | { type: "ready" }
  | { type: "send"; text: string; privateBranch?: boolean }
  | { type: "select"; id: string }
  | { type: "refresh" }
  | { type: "cancel" }
  | { type: "resend" }
  | { type: "copy"; text: string }
  | { type: "rename" }
  | { type: "togglePin" };

function randomNonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  for (let i = 0; i < 32; i++) {
    s += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return s;
}

export type ConversationPanelControllerOptions = {
  api: ColcoorApiClient;
  agent: AgentRunner;
  getWorkspaceRoot: () => string;
};

/**
 * Webview panel: event tree, thread path (root → selected), composer.
 * New messages attach under the selected node; transcript uses the same path + new user text.
 */
export function createConversationPanelController(
  context: vscode.ExtensionContext,
  options: ConversationPanelControllerOptions,
): {
  reveal: (conversationId: string, title: string | null) => Promise<void>;
  dispose: () => void;
} {
  const { api, agent, getWorkspaceRoot } = options;

  let panel: vscode.WebviewPanel | undefined;
  let webviewReady = false;
  let conversationId: string | undefined;
  let conversationTitle: string | null | undefined;
  let conversationPinned = false;
  let selectedEventId: string | undefined;
  let sendAbort: AbortController | undefined;

  async function refreshConversationMeta(): Promise<void> {
    if (!conversationId) {
      return;
    }
    try {
      const rows = await api.listConversations();
      const row = rows.find((r) => r.id === conversationId);
      if (row) {
        conversationPinned = row.pinned;
        conversationTitle = row.title;
      }
    } catch {
      /* keep previous meta */
    }
  }

  function disposePanel(): void {
    sendAbort?.abort();
    sendAbort = undefined;
    panel?.dispose();
    panel = undefined;
    webviewReady = false;
  }

  /** Push a minimal state when the webview is up but no conversation is bound (avoids infinite “Loading…”). */
  function postBootstrapNoConversationState(lastError: string): void {
    if (!panel || !webviewReady) {
      return;
    }
    const msg: WebviewStateMessage = {
      type: "state",
      conversationId: "",
      title: null,
      conversationPinned: false,
      events: [],
      selectedEventId: "",
      threadSegments: [],
      busy: false,
      lastError,
    };
    try {
      void panel.webview.postMessage(msg);
    } catch {
      /* panel gone */
    }
  }

  function postState(
    events: GraphEventNode[],
    busy: boolean,
    lastError: string | null,
  ): void {
    if (!panel || !conversationId || !webviewReady) {
      return;
    }
    const cid = conversationId;
    const fallbackMsg = (err: string): WebviewStateMessage => ({
      type: "state",
      conversationId: cid,
      title: conversationTitle ?? null,
      conversationPinned,
      events: [],
      selectedEventId: "",
      threadSegments: [],
      busy: false,
      lastError: err,
    });
    try {
      const ids = new Set(events.map((e) => e.id));
      let sel = selectedEventId;
      if (!sel || !ids.has(sel)) {
        try {
          sel = events.length > 0 ? findBranchTip(events).id : "";
        } catch {
          sel = events[0]?.id ?? "";
        }
        selectedEventId = sel;
      }
      const threadSegments = buildThreadSegments(events, sel ?? "");
      const msg: WebviewStateMessage = {
        type: "state",
        conversationId: cid,
        title: conversationTitle ?? null,
        conversationPinned,
        events: slimEventsForWebviewPostMessage(events),
        selectedEventId: sel ?? "",
        threadSegments,
        busy,
        lastError,
      };
      try {
        void panel.webview.postMessage(msg);
      } catch (postErr) {
        const detail = postErr instanceof Error ? postErr.message : String(postErr);
        void panel.webview.postMessage(
          fallbackMsg(
            `Could not send conversation state to the panel (payload may be too large). ${detail}`,
          ),
        );
      }
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      try {
        void panel.webview.postMessage(
          fallbackMsg(`Colcoor: failed to build thread view — ${detail}`),
        );
      } catch {
        /* webview may be gone */
      }
    }
  }

  async function loadTreeAndPush(busy: boolean, lastError: string | null): Promise<void> {
    if (!conversationId) {
      return;
    }
    try {
      const { events } = await api.getTree(conversationId);
      postState(events, busy, lastError);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      postState([], busy, msg);
    }
  }

  async function handleSend(text: string, privateBranch: boolean): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed || !conversationId || !selectedEventId) {
      return;
    }
    const ws = getWorkspaceRoot();
    sendAbort?.abort();
    sendAbort = new AbortController();
    const signal = sendAbort.signal;
    await loadTreeAndPush(true, null);
    const stream = createAssistantStreamPusher(() => panel, () => webviewReady);
    try {
      const result = await runColcoorUserTurn(
        api,
        agent,
        conversationId,
        conversationTitle,
        trimmed,
        ws,
        {
          replyParentEventId: selectedEventId,
          privateBranch,
          signal,
          onAssistantTextDelta: (t) => stream.pushDelta(t),
          onUserMessagePersisted: async ({ userEventId }) => {
            selectedEventId = userEventId;
            await loadTreeAndPush(true, null);
          },
        },
      );
      stream.dispose();
      const { events } = await api.getTree(conversationId);
      try {
        selectedEventId = findBranchTip(events).id;
      } catch {
        selectedEventId = events.at(-1)?.id;
      }
      postState(events, false, null);
      if (result.cancelled) {
        void vscode.window.showInformationMessage(
          result.assistantText?.trim()
            ? "Colcoor: stopped — partial assistant reply was saved."
            : "Colcoor: stopped — no assistant text was saved.",
        );
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      stream.dispose();
      await loadTreeAndPush(false, msg);
    } finally {
      sendAbort = undefined;
    }
  }

  async function handleResend(): Promise<void> {
    if (!conversationId || !selectedEventId) {
      return;
    }
    const ws = getWorkspaceRoot();
    sendAbort?.abort();
    sendAbort = new AbortController();
    const signal = sendAbort.signal;
    await loadTreeAndPush(true, null);
    const stream = createAssistantStreamPusher(() => panel, () => webviewReady);
    try {
      const result = await runResendAssistant(
        api,
        agent,
        conversationId,
        conversationTitle,
        selectedEventId,
        ws,
        { signal, onAssistantTextDelta: (t) => stream.pushDelta(t) },
      );
      stream.dispose();
      const { events } = await api.getTree(conversationId);
      try {
        selectedEventId = findBranchTip(events).id;
      } catch {
        selectedEventId = events.at(-1)?.id;
      }
      postState(events, false, null);
      if (result.cancelled) {
        void vscode.window.showInformationMessage(
          result.assistantText?.trim()
            ? "Colcoor: stopped — partial assistant reply was saved."
            : "Colcoor: stopped — no assistant text was saved.",
        );
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      stream.dispose();
      await loadTreeAndPush(false, msg);
    } finally {
      sendAbort = undefined;
    }
  }

  async function handleRename(): Promise<void> {
    if (!conversationId) {
      return;
    }
    const current = conversationTitle ?? "";
    const next = await vscode.window.showInputBox({
      title: "Colcoor — rename conversation",
      value: current,
      prompt: "Leave blank for untitled",
      ignoreFocusOut: true,
    });
    if (next === undefined) {
      return;
    }
    try {
      const out = await api.patchConversation(conversationId, {
        title: next.trim() ? next.trim() : null,
      });
      conversationTitle = out.title;
      if (panel) {
        panel.title = `Colcoor — ${out.title?.trim() ? out.title : "(untitled)"}`;
      }
      await refreshConversationMeta();
      await loadTreeAndPush(false, null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await vscode.window.showErrorMessage(`Colcoor: ${msg}`);
    }
  }

  async function handleTogglePin(): Promise<void> {
    if (!conversationId) {
      return;
    }
    try {
      await api.patchConversation(conversationId, { pinned: !conversationPinned });
      await refreshConversationMeta();
      await loadTreeAndPush(false, null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await vscode.window.showErrorMessage(`Colcoor: ${msg}`);
    }
  }

  const subscription = vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration("colcoor") && panel) {
      void vscode.window.showInformationMessage(
        "Colcoor settings changed — close and reopen the conversation panel if the backend URL or agent mode should apply.",
      );
    }
  });

  function ensurePanel(): vscode.WebviewPanel {
    if (panel) {
      return panel;
    }
    const nonce = randomNonce();
    const p = vscode.window.createWebviewPanel(
      "colcoor.conversation",
      "Colcoor",
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [context.extensionUri],
      },
    );
    p.webview.options = { enableScripts: true, localResourceRoots: [context.extensionUri] };
    p.webview.html = getConversationWebviewHtml(p.webview.cspSource, nonce);
    webviewReady = false;

    p.webview.onDidReceiveMessage(async (raw: unknown) => {
      const msg = raw as FromWebview;
      if (!msg || typeof msg !== "object" || !("type" in msg)) {
        return;
      }
      if (msg.type === "ready") {
        webviewReady = true;
        if (!conversationId) {
          postBootstrapNoConversationState(
            "No conversation is linked to this panel. Open one from the Colcoor sidebar or run “Colcoor: Open conversation”.",
          );
          return;
        }
        await loadTreeAndPush(false, null);
        return;
      }
      if (msg.type === "select" && typeof msg.id === "string") {
        selectedEventId = msg.id;
        await loadTreeAndPush(false, null);
        return;
      }
      if (msg.type === "refresh") {
        await loadTreeAndPush(false, null);
        return;
      }
      if (msg.type === "cancel") {
        sendAbort?.abort();
        return;
      }
      if (msg.type === "copy" && typeof msg.text === "string") {
        await vscode.env.clipboard.writeText(msg.text);
        return;
      }
      if (msg.type === "resend") {
        await handleResend();
        return;
      }
      if (msg.type === "rename") {
        await handleRename();
        return;
      }
      if (msg.type === "togglePin") {
        await handleTogglePin();
        return;
      }
      if (msg.type === "send" && typeof msg.text === "string") {
        await handleSend(msg.text, Boolean(msg.privateBranch));
      }
    });

    p.onDidDispose(() => {
      sendAbort?.abort();
      sendAbort = undefined;
      panel = undefined;
      webviewReady = false;
      conversationId = undefined;
      selectedEventId = undefined;
      conversationPinned = false;
    });

    panel = p;
    return p;
  }

  return {
    async reveal(convId: string, title: string | null): Promise<void> {
      conversationId = convId;
      conversationTitle = title;
      conversationPinned = false;
      selectedEventId = undefined;
      await refreshConversationMeta();
      const p = ensurePanel();
      p.title = `Colcoor — ${title?.trim() ? title : "(untitled)"}`;
      p.reveal(vscode.ViewColumn.One, false);
      if (webviewReady) {
        await new Promise<void>((r) => {
          setTimeout(r, 0);
        });
        await loadTreeAndPush(false, null);
      }
    },
    dispose: () => {
      subscription.dispose();
      disposePanel();
    },
  };
}
