import * as vscode from "vscode";
import type { AgentRunner } from "../agent/agentRunner";
import type { ColcoorApiClient, GraphEventNode, NoteOut } from "../api/client";
import { isPlanLimitColcoorApiError } from "../api/colcoorApiHttpError";
import { createAssistantStreamPusher } from "./assistantStreamWebview";
import { COLCOOR_CONVERSATION_REPLY_IN_PROGRESS_CONTEXT } from "./colcoorContextKeys";
import { isSafeHttpUrlForWebview, listLegalPolicyLinksFromColcoorWorkspaceSection } from "./legalPolicySection";
import { getConversationWebviewHtml } from "./conversationWebviewHtml";
import { runResendAssistant } from "./resendAssistant";
import {
  normalizeOptionalGraphEventId,
  normalizePersistedUserInputText,
} from "./normalizeUserInputText";
import { runColcoorUserTurn } from "./runUserTurn";
import { buildPlainThread } from "./threadPlainText";
import { buildThreadSegments, type ThreadSegment } from "./threadSegments";
import { staleTreeMissingSelectionPromptKey } from "./staleTreePromptPolicy";
import { pruneCollapsedEventIdsForStorage } from "./treeCollapseIds";
import {
  COMPOSER_TEXTAREA_HEIGHT_STATE_KEY,
  clampComposerTextareaHeightPx,
} from "./composerLayoutPersistence";
import { findBranchTip } from "./treeEvents";
import { normalizedConversationTitle } from "../conversations/renameConversationTitle";
import { showColcoorApiFailure } from "../util/showColcoorApiFailure";

const TREE_WIDTH_STATE_KEY = "colcoor.conversation.treeWidthPx";
/** `conversation_id` → event ids whose branches are collapsed in the webview tree ([tree-ui-contract.md]). */
const TREE_COLLAPSED_BY_CONV_KEY = "colcoor.treeCollapsedByConversation";
const colcoorNotesChannel = vscode.window.createOutputChannel("Colcoor notes");

type WebviewStateMessage = {
  type: "state";
  conversationId: string;
  title: string | null;
  conversationPinned: boolean;
  events: GraphEventNode[];
  selectedEventId: string;
  threadSegments: ThreadSegment[];
  /** Plain root → selected path for “copy thread”. */
  threadPlainText: string;
  /** Workspace-persisted tree column width (px), when set. */
  treeWidthPx: number | null;
  /** Workspace-persisted composer textarea height (px), when set. */
  composerTextareaHeightPx: number | null;
  /** Collapsed branch roots for this conversation (pruned to current `events`). */
  treeCollapsedEventIds: string[];
  /** Settings: expand CLI trace `<details>` by default. */
  agentTraceOpen: boolean;
  /** Server flag: next send should rebuild transcript from full path (domain-model §4). */
  needsContextRebuild: boolean;
  busy: boolean;
  lastError: string | null;
  /** Terms / Privacy / Refund from workspace settings ([ui-features.md] §1.3). */
  legalPolicyLinks: { label: string; url: string }[];
};

type FromWebview =
  | { type: "ready" }
  | { type: "send"; text: string; privateBranch?: boolean }
  | { type: "select"; id: string }
  | { type: "selectTip" }
  | { type: "refresh" }
  | { type: "cancel" }
  | { type: "resend" }
  | { type: "copy"; text: string }
  | { type: "copyThread"; text: string }
  | { type: "layout"; treeWidthPx?: number; composerTextareaHeightPx?: number }
  | { type: "continueFromHere" }
  | { type: "referenceInSideChat" }
  | { type: "referenceNoteInSideChat" }
  | { type: "openMembers" }
  | { type: "addMember" }
  | { type: "changeMemberRole" }
  | { type: "removeMember" }
  | { type: "openSideChat" }
  | { type: "setupCursorCli" }
  | { type: "setCursorAgentApiKey" }
  | { type: "deleteConversation" }
  | { type: "openProfile" }
  | { type: "openSettings" }
  | { type: "openAbout" }
  | { type: "openLegalPolicyUrl"; url: string }
  | { type: "openStarredDrawer" }
  | { type: "openTodoDrawer" }
  | { type: "openDrawers" }
  | { type: "rename" }
  | { type: "togglePin" }
  | { type: "treeCollapse"; collapsedEventIds: string[] }
  | { type: "editNote"; noteId: string }
  | { type: "deleteNote"; noteId: string };

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
  /** Open conversation and select a specific tree event (e.g. jump from a TODO note). */
  revealAtEvent: (conversationId: string, title: string | null, eventId: string) => Promise<void>;
  /** Close the webview panel if it is showing this conversation (e.g. after delete). */
  closeIfShowingConversation: (conversationId: string) => void;
  /** Star or unstar the selected tree node via API (command palette). */
  toggleStarSelectedMessage: () => Promise<void>;
  /** Attach a note to the selected event (owner/editor); refreshes tree. */
  addNoteToSelectedMessage: () => Promise<void>;
  /** List notes for the selected event in the “Colcoor notes” output channel. */
  showNotesOnSelectedMessage: () => Promise<void>;
  /** Current conversation + selected event (for cross-panel actions like side-chat references). */
  getSelectedMessageContext: () => { conversationId: string; selectedEventId: string; title: string | null } | null;
  /** Abort in-flight send/resend in this panel (same as the webview Stop button). No-op if idle. */
  cancelInFlightGeneration: () => void;
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

  /** When `true`, a main-thread send or resend is using `sendAbort` (palette keybindings can use this). */
  function syncConversationReplyInProgressContext(): void {
    void vscode.commands.executeCommand(
      "setContext",
      COLCOOR_CONVERSATION_REPLY_IN_PROGRESS_CONTEXT,
      sendAbort != null,
    );
  }

  /** Last successful tree payload for lightweight UI refresh (e.g. settings). */
  let lastTreeEvents: GraphEventNode[] = [];
  /** Notes list aligned with the last successful tree load (for thread rendering without extra round-trips). */
  let lastNotes: NoteOut[] = [];
  /** From GET …/caller-state after each successful tree load (domain-model §4). */
  let lastNeedsContextRebuild = false;
  /** One-time dedupe key for stale-tree prompt when selected node disappears after refresh. */
  let staleTreePromptedForEventId: string | null = null;

  function syncActiveToBackend(
    activeEventId: string | undefined,
    opts?: { needsContextRebuild?: boolean },
  ): void {
    if (!conversationId || !activeEventId) {
      return;
    }
    void api
      .setConversationActive(conversationId, {
        active_event_id: activeEventId,
        needs_context_rebuild: opts?.needsContextRebuild ?? false,
      })
      .catch((e) => {
        const m = e instanceof Error ? e.message : String(e);
        void vscode.window.showWarningMessage(`Colcoor: could not persist active node — ${m}`);
      });
  }

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
    syncConversationReplyInProgressContext();
    panel?.dispose();
    panel = undefined;
    webviewReady = false;
    lastTreeEvents = [];
    lastNotes = [];
    lastNeedsContextRebuild = false;
  }

  function readCollapsedByConversation(): Record<string, string[]> {
    return context.workspaceState.get<Record<string, string[]>>(TREE_COLLAPSED_BY_CONV_KEY) ?? {};
  }

  function prunedCollapsedEventIds(events: GraphEventNode[]): string[] {
    if (!conversationId) {
      return [];
    }
    const raw = readCollapsedByConversation()[conversationId] ?? [];
    const valid = new Set(events.map((e) => e.id));
    return raw.filter((id) => valid.has(id));
  }

  function postState(
    events: GraphEventNode[],
    busy: boolean,
    lastError: string | null,
  ): void {
    if (!panel || !conversationId || !webviewReady) {
      return;
    }
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
      const treeW = context.workspaceState.get<number>(TREE_WIDTH_STATE_KEY);
      const treeWidthPx =
        typeof treeW === "number" && Number.isFinite(treeW) && treeW >= 140 && treeW < 8000
          ? Math.floor(treeW)
          : null;
      const composerTextareaHeightPx = clampComposerTextareaHeightPx(
        context.workspaceState.get<number>(COMPOSER_TEXTAREA_HEIGHT_STATE_KEY),
      );
      const agentTraceOpen =
        vscode.workspace.getConfiguration("colcoor").get<boolean>("conversationAgentTraceOpen") ?? true;
      const msg: WebviewStateMessage = {
        type: "state",
        conversationId,
        title: conversationTitle ?? null,
        conversationPinned,
        events,
        selectedEventId: sel ?? "",
        threadSegments: buildThreadSegments(events, sel ?? "", lastNotes),
        threadPlainText: buildPlainThread(events, sel ?? "", lastNotes),
        treeWidthPx,
        composerTextareaHeightPx,
        treeCollapsedEventIds: prunedCollapsedEventIds(events),
        agentTraceOpen,
        needsContextRebuild: lastNeedsContextRebuild,
        busy,
        lastError,
        legalPolicyLinks: listLegalPolicyLinksFromColcoorWorkspaceSection(
          vscode.workspace.getConfiguration("colcoor"),
        ),
      };
      lastTreeEvents = events;
      void panel.webview.postMessage(msg);
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      void vscode.window.showErrorMessage(`Colcoor: failed to render conversation — ${detail}`);
      try {
        const treeW = context.workspaceState.get<number>(TREE_WIDTH_STATE_KEY);
        const treeWidthPx =
          typeof treeW === "number" && Number.isFinite(treeW) && treeW >= 140 && treeW < 8000
            ? Math.floor(treeW)
            : null;
        const composerTextareaHeightPx = clampComposerTextareaHeightPx(
          context.workspaceState.get<number>(COMPOSER_TEXTAREA_HEIGHT_STATE_KEY),
        );
        const agentTraceOpen =
          vscode.workspace.getConfiguration("colcoor").get<boolean>("conversationAgentTraceOpen") ?? true;
        const fallback: WebviewStateMessage = {
          type: "state",
          conversationId,
          title: conversationTitle ?? null,
          conversationPinned,
          events: [],
          selectedEventId: "",
          threadSegments: [],
          threadPlainText: "",
          treeWidthPx,
          composerTextareaHeightPx,
          treeCollapsedEventIds: [],
          agentTraceOpen,
          needsContextRebuild: false,
          busy,
          lastError:
            lastError ??
            `Render failed: ${detail}. If the conversation is very large, try the API or a fresh thread.`,
          legalPolicyLinks: listLegalPolicyLinksFromColcoorWorkspaceSection(
            vscode.workspace.getConfiguration("colcoor"),
          ),
        };
        void panel.webview.postMessage(fallback);
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
      const previousSelectedEventId = selectedEventId;
      const previousEventIds = new Set(lastTreeEvents.map((e) => e.id));
      const [{ events }, notes, caller] = await Promise.all([
        api.getTree(conversationId),
        api.listNotes(conversationId),
        api.getConversationCallerState(conversationId).catch((): null => null),
      ]);
      const nextEventIds = new Set(events.map((e) => e.id));
      const stalePromptKey = staleTreeMissingSelectionPromptKey({
        previousSelectedEventId,
        previousEventIds,
        nextEventIds,
        alreadyPromptedForEventId: staleTreePromptedForEventId,
      });
      lastNotes = notes;
      if (caller) {
        lastNeedsContextRebuild = Boolean(caller.needs_context_rebuild);
        const aid = caller.active_event_id;
        if (events.some((e) => e.id === aid)) {
          selectedEventId = aid;
        }
      } else {
        lastNeedsContextRebuild = false;
      }
      if (selectedEventId && nextEventIds.has(selectedEventId)) {
        staleTreePromptedForEventId = null;
      }
      if (!busy && stalePromptKey) {
        staleTreePromptedForEventId = stalePromptKey;
        const choice = await vscode.window.showWarningMessage(
          "Colcoor: the shared tree changed and your previous selection is no longer available.",
          "Refresh tree",
        );
        if (choice === "Refresh tree") {
          await loadTreeAndPush(false, null);
          return;
        }
      }
      postState(events, busy, lastError);
    } catch (e) {
      if (isPlanLimitColcoorApiError(e)) {
        void showColcoorApiFailure(e);
      }
      const msg = e instanceof Error ? e.message : String(e);
      lastNotes = [];
      lastNeedsContextRebuild = false;
      postState([], busy, msg);
    }
  }

  async function handleSend(text: string, privateBranch: boolean): Promise<void> {
    const trimmed = normalizePersistedUserInputText(text);
    if (!trimmed || !conversationId || !selectedEventId) {
      return;
    }
    const ws = getWorkspaceRoot();
    sendAbort?.abort();
    sendAbort = new AbortController();
    syncConversationReplyInProgressContext();
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
      const [{ events }, notes, caller] = await Promise.all([
        api.getTree(conversationId),
        api.listNotes(conversationId),
        api.getConversationCallerState(conversationId).catch((): null => null),
      ]);
      lastNotes = notes;
      if (caller) {
        lastNeedsContextRebuild = Boolean(caller.needs_context_rebuild);
      } else {
        lastNeedsContextRebuild = false;
      }
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
      if (isPlanLimitColcoorApiError(e)) {
        void showColcoorApiFailure(e);
      }
      const msg = e instanceof Error ? e.message : String(e);
      stream.dispose();
      await loadTreeAndPush(false, msg);
    } finally {
      sendAbort = undefined;
      syncConversationReplyInProgressContext();
    }
  }

  async function handleResend(): Promise<void> {
    if (!conversationId || !selectedEventId) {
      return;
    }
    const ws = getWorkspaceRoot();
    sendAbort?.abort();
    sendAbort = new AbortController();
    syncConversationReplyInProgressContext();
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
      const [{ events }, notes, caller] = await Promise.all([
        api.getTree(conversationId),
        api.listNotes(conversationId),
        api.getConversationCallerState(conversationId).catch((): null => null),
      ]);
      lastNotes = notes;
      if (caller) {
        lastNeedsContextRebuild = Boolean(caller.needs_context_rebuild);
      } else {
        lastNeedsContextRebuild = false;
      }
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
      if (isPlanLimitColcoorApiError(e)) {
        void showColcoorApiFailure(e);
      }
      const msg = e instanceof Error ? e.message : String(e);
      stream.dispose();
      await loadTreeAndPush(false, msg);
    } finally {
      sendAbort = undefined;
      syncConversationReplyInProgressContext();
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
        title: normalizedConversationTitle(next),
      });
      conversationTitle = out.title;
      if (panel) {
        panel.title = `Colcoor — ${out.title?.trim() ? out.title : "(untitled)"}`;
      }
      await refreshConversationMeta();
      await loadTreeAndPush(false, null);
    } catch (e) {
      await showColcoorApiFailure(e);
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
      await showColcoorApiFailure(e);
    }
  }

  const subscription = vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration("colcoor.conversationAgentTraceOpen") && panel && webviewReady && conversationId) {
      postState(lastTreeEvents, false, null);
    } else if (e.affectsConfiguration("colcoor") && panel) {
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

    p.webview.onDidReceiveMessage(async (raw: unknown) => {
      const msg = raw as FromWebview;
      if (!msg || typeof msg !== "object" || !("type" in msg)) {
        return;
      }
      if (msg.type === "ready") {
        webviewReady = true;
        await loadTreeAndPush(false, null);
        return;
      }
      if (msg.type === "select" && typeof msg.id === "string") {
        const prevSel = selectedEventId;
        selectedEventId = msg.id;
        syncActiveToBackend(msg.id, {
          needsContextRebuild: prevSel !== undefined && prevSel !== msg.id,
        });
        await loadTreeAndPush(false, null);
        return;
      }
      if (msg.type === "selectTip") {
        if (!conversationId) {
          return;
        }
        try {
          const prevSel = selectedEventId;
          const { events } = await api.getTree(conversationId);
          try {
            selectedEventId = findBranchTip(events).id;
          } catch {
            selectedEventId = events[0]?.id;
          }
          syncActiveToBackend(selectedEventId, {
            needsContextRebuild:
              selectedEventId !== undefined &&
              prevSel !== undefined &&
              prevSel !== selectedEventId,
          });
          await loadTreeAndPush(false, null);
        } catch (e) {
          void showColcoorApiFailure(e);
        }
        return;
      }
      if (msg.type === "refresh") {
        await loadTreeAndPush(false, null);
        return;
      }
      if (msg.type === "openLegalPolicyUrl" && typeof msg.url === "string") {
        const u = msg.url.trim();
        if (isSafeHttpUrlForWebview(u)) {
          void vscode.env.openExternal(vscode.Uri.parse(u));
        }
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
      if (msg.type === "copyThread" && typeof msg.text === "string") {
        const t = normalizePersistedUserInputText(msg.text);
        if (t.length > 0) {
          await vscode.env.clipboard.writeText(t);
          void vscode.window.setStatusBarMessage("Colcoor: thread copied to clipboard.", 2500);
        }
        return;
      }
      if (msg.type === "layout") {
        if (typeof msg.treeWidthPx === "number") {
          const w = Math.floor(msg.treeWidthPx);
          if (w >= 140 && w < 8000) {
            void context.workspaceState.update(TREE_WIDTH_STATE_KEY, w);
          }
        }
        if (typeof msg.composerTextareaHeightPx === "number") {
          const h = clampComposerTextareaHeightPx(msg.composerTextareaHeightPx);
          if (h != null) {
            void context.workspaceState.update(COMPOSER_TEXTAREA_HEIGHT_STATE_KEY, h);
          }
        }
        return;
      }
      if (msg.type === "treeCollapse" && Array.isArray(msg.collapsedEventIds) && conversationId) {
        const valid = new Set(lastTreeEvents.map((e) => e.id));
        const pruned = pruneCollapsedEventIdsForStorage(msg.collapsedEventIds, valid);
        const all = { ...readCollapsedByConversation(), [conversationId]: pruned };
        void context.workspaceState.update(TREE_COLLAPSED_BY_CONV_KEY, all);
        return;
      }
      if (msg.type === "resend") {
        await handleResend();
        return;
      }
      if (msg.type === "continueFromHere") {
        if (!conversationId || !selectedEventId) {
          return;
        }
        const exists = lastTreeEvents.some((e) => e.id === selectedEventId);
        if (!exists) {
          void vscode.window.showWarningMessage(
            "Colcoor: selection is not in the loaded tree — try Refresh tree.",
          );
          return;
        }
        syncActiveToBackend(selectedEventId, { needsContextRebuild: false });
        void vscode.window.setStatusBarMessage("Colcoor: continuing from selected message.", 2200);
        return;
      }
      if (msg.type === "referenceInSideChat") {
        if (!conversationId || !selectedEventId) {
          return;
        }
        const exists = lastTreeEvents.some((e) => e.id === selectedEventId);
        if (!exists) {
          void vscode.window.showWarningMessage(
            "Colcoor: selection is not in the loaded tree — try Refresh tree.",
          );
          return;
        }
        await vscode.commands.executeCommand("colcoor.referenceSelectedMessageInSideChat");
        return;
      }
      if (msg.type === "referenceNoteInSideChat") {
        if (!conversationId || !selectedEventId) {
          return;
        }
        const exists = lastTreeEvents.some((e) => e.id === selectedEventId);
        if (!exists) {
          void vscode.window.showWarningMessage(
            "Colcoor: selection is not in the loaded tree — try Refresh tree.",
          );
          return;
        }
        await vscode.commands.executeCommand("colcoor.referenceSelectedNoteInSideChat");
        return;
      }
      if (msg.type === "openStarredDrawer") {
        if (!conversationId) {
          return;
        }
        await vscode.commands.executeCommand("colcoor.openConversationDrawers", {
          conv: { id: conversationId, title: conversationTitle ?? null },
          preferredTab: "starred",
        });
        return;
      }
      if (msg.type === "openTodoDrawer") {
        if (!conversationId) {
          return;
        }
        await vscode.commands.executeCommand("colcoor.openConversationDrawers", {
          conv: { id: conversationId, title: conversationTitle ?? null },
          preferredTab: "todo",
        });
        return;
      }
      if (msg.type === "openDrawers") {
        if (!conversationId) {
          return;
        }
        await vscode.commands.executeCommand("colcoor.openConversationDrawers", {
          conv: { id: conversationId, title: conversationTitle ?? null },
        });
        return;
      }
      if (msg.type === "openMembers") {
        if (!conversationId) {
          return;
        }
        await vscode.commands.executeCommand("colcoor.listConversationMembers", {
          conv: { id: conversationId, title: conversationTitle ?? null },
        });
        return;
      }
      if (msg.type === "addMember") {
        if (!conversationId) {
          return;
        }
        await vscode.commands.executeCommand("colcoor.addConversationMember", {
          conv: { id: conversationId, title: conversationTitle ?? null },
        });
        return;
      }
      if (msg.type === "changeMemberRole") {
        if (!conversationId) {
          return;
        }
        await vscode.commands.executeCommand("colcoor.changeMemberRole", {
          conv: { id: conversationId, title: conversationTitle ?? null },
        });
        return;
      }
      if (msg.type === "removeMember") {
        if (!conversationId) {
          return;
        }
        await vscode.commands.executeCommand("colcoor.removeMemberFromConversation", {
          conv: { id: conversationId, title: conversationTitle ?? null },
        });
        return;
      }
      if (msg.type === "openSideChat") {
        if (!conversationId) {
          return;
        }
        await vscode.commands.executeCommand("colcoor.openSideChat", {
          conv: { id: conversationId, title: conversationTitle ?? null },
        });
        return;
      }
      if (msg.type === "setupCursorCli") {
        await vscode.commands.executeCommand("colcoor.setupCursorCli");
        return;
      }
      if (msg.type === "setCursorAgentApiKey") {
        await vscode.commands.executeCommand("colcoor.setCursorAgentApiKey");
        return;
      }
      if (msg.type === "deleteConversation") {
        if (!conversationId) {
          return;
        }
        await vscode.commands.executeCommand("colcoor.deleteConversation", {
          conv: { id: conversationId, title: conversationTitle ?? null },
        });
        return;
      }
      if (msg.type === "openProfile") {
        await vscode.commands.executeCommand("colcoor.editProfile");
        return;
      }
      if (msg.type === "openSettings") {
        await vscode.commands.executeCommand("colcoor.openSettings");
        return;
      }
      if (msg.type === "openAbout") {
        await vscode.commands.executeCommand("colcoor.openAbout");
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
        return;
      }
      if (msg.type === "deleteNote" && typeof msg.noteId === "string" && conversationId) {
        const choice = await vscode.window.showWarningMessage(
          "Delete this note?",
          { modal: true, detail: msg.noteId },
          "Delete",
        );
        if (choice !== "Delete") {
          return;
        }
        try {
          await api.deleteNote(conversationId, msg.noteId);
          void vscode.window.setStatusBarMessage("Colcoor: note deleted.", 2000);
          await loadTreeAndPush(false, null);
        } catch (e) {
          void showColcoorApiFailure(e);
        }
        return;
      }
      if (msg.type === "editNote" && typeof msg.noteId === "string" && conversationId) {
        try {
          const all = await api.listNotes(conversationId);
          const row = all.find((n) => n.id === msg.noteId);
          if (!row) {
            void vscode.window.showWarningMessage("Colcoor: note not found — try Refresh tree.");
            return;
          }
          const next = await vscode.window.showInputBox({
            title: "Colcoor — edit note",
            value: row.content,
            prompt: "Note text (viewers cannot edit notes).",
            ignoreFocusOut: true,
          });
          if (next === undefined) {
            return;
          }
          const trimmed = normalizePersistedUserInputText(next);
          if (!trimmed) {
            void vscode.window.showWarningMessage("Colcoor: note text cannot be empty.");
            return;
          }
          await api.patchNote(conversationId, msg.noteId, { content: trimmed });
          void vscode.window.setStatusBarMessage("Colcoor: note updated.", 2000);
          await loadTreeAndPush(false, null);
        } catch (e) {
          void showColcoorApiFailure(e);
        }
      }
    });

    p.onDidDispose(() => {
      sendAbort?.abort();
      sendAbort = undefined;
      syncConversationReplyInProgressContext();
      panel = undefined;
      webviewReady = false;
      conversationId = undefined;
      selectedEventId = undefined;
      conversationPinned = false;
      lastTreeEvents = [];
      lastNotes = [];
      lastNeedsContextRebuild = false;
    });

    panel = p;
    return p;
  }

  async function toggleStarSelectedMessage(): Promise<void> {
    if (!conversationId || !selectedEventId) {
      void vscode.window.showWarningMessage("Colcoor: open a conversation and select a message in the tree.");
      return;
    }
    const ev = lastTreeEvents.find((e) => e.id === selectedEventId);
    if (!ev) {
      void vscode.window.showWarningMessage("Colcoor: selection not in the loaded tree — try Refresh tree.");
      return;
    }
    try {
      if (ev.starred === true) {
        await api.deleteStar(conversationId, selectedEventId);
        void vscode.window.setStatusBarMessage("Colcoor: star removed.", 2000);
      } else {
        await api.putStar(conversationId, selectedEventId);
        void vscode.window.setStatusBarMessage("Colcoor: message starred.", 2000);
      }
      await loadTreeAndPush(false, null);
    } catch (e) {
      void showColcoorApiFailure(e);
    }
  }

  async function addNoteToSelectedMessage(): Promise<void> {
    if (!conversationId || !selectedEventId) {
      void vscode.window.showWarningMessage("Colcoor: open a conversation and select a message in the tree.");
      return;
    }
    if (!lastTreeEvents.some((e) => e.id === selectedEventId)) {
      void vscode.window.showWarningMessage("Colcoor: selection not in the loaded tree — try Refresh tree.");
      return;
    }
    const text = await vscode.window.showInputBox({
      title: "Colcoor — add note",
      prompt: "Note text (attached to the selected message; viewers cannot add notes).",
      ignoreFocusOut: true,
    });
    if (text === undefined) {
      return;
    }
    const noteContent = normalizePersistedUserInputText(text);
    if (!noteContent) {
      return;
    }
    try {
      await api.createNote(conversationId, { event_id: selectedEventId, content: noteContent });
      void vscode.window.setStatusBarMessage("Colcoor: note added.", 2500);
      await loadTreeAndPush(false, null);
    } catch (e) {
      void showColcoorApiFailure(e);
    }
  }

  async function showNotesOnSelectedMessage(): Promise<void> {
    if (!conversationId || !selectedEventId) {
      void vscode.window.showWarningMessage("Colcoor: open a conversation and select a message in the tree.");
      return;
    }
    try {
      const all = await api.listNotes(conversationId);
      const forEv = all.filter((n) => n.event_id === selectedEventId);
      colcoorNotesChannel.clear();
      colcoorNotesChannel.appendLine(`Notes on event ${selectedEventId} (${forEv.length})`);
      colcoorNotesChannel.appendLine("");
      if (forEv.length === 0) {
        colcoorNotesChannel.appendLine("(none)");
      } else {
        for (const n of forEv) {
          colcoorNotesChannel.appendLine(`— ${n.id}`);
          colcoorNotesChannel.appendLine(n.content.split("\n").map((line) => `  ${line}`).join("\n"));
          colcoorNotesChannel.appendLine("");
        }
      }
      colcoorNotesChannel.show(true);
    } catch (e) {
      void showColcoorApiFailure(e);
    }
  }

  return {
    async reveal(convId: string, title: string | null): Promise<void> {
      const cid = normalizeOptionalGraphEventId(convId);
      if (cid === undefined) {
        return;
      }
      conversationId = cid;
      conversationTitle = title;
      conversationPinned = false;
      staleTreePromptedForEventId = null;
      selectedEventId = undefined;
      lastNotes = [];
      lastNeedsContextRebuild = false;
      lastTreeEvents = [];
      await refreshConversationMeta();
      const p = ensurePanel();
      p.title = `Colcoor — ${title?.trim() ? title : "(untitled)"}`;
      if (webviewReady) {
        await loadTreeAndPush(false, null);
      }
      p.reveal(vscode.ViewColumn.One, false);
    },
    async revealAtEvent(convId: string, title: string | null, eventId: string): Promise<void> {
      const cid = normalizeOptionalGraphEventId(convId);
      const eid = normalizeOptionalGraphEventId(eventId);
      if (cid === undefined || eid === undefined) {
        return;
      }
      conversationId = cid;
      conversationTitle = title;
      conversationPinned = false;
      staleTreePromptedForEventId = null;
      lastNotes = [];
      lastNeedsContextRebuild = false;
      lastTreeEvents = [];
      await refreshConversationMeta();
      try {
        await api.setConversationActive(cid, {
          active_event_id: eid,
          needs_context_rebuild: false,
        });
      } catch (e) {
        await showColcoorApiFailure(e);
        return;
      }
      selectedEventId = eid;
      const p = ensurePanel();
      p.title = `Colcoor — ${title?.trim() ? title : "(untitled)"}`;
      if (webviewReady) {
        await loadTreeAndPush(false, null);
      }
      p.reveal(vscode.ViewColumn.One, false);
    },
    closeIfShowingConversation(convId: string): void {
      const cid = normalizeOptionalGraphEventId(convId);
      if (cid !== undefined && conversationId === cid) {
        disposePanel();
      }
    },
    toggleStarSelectedMessage,
    addNoteToSelectedMessage,
    showNotesOnSelectedMessage,
    getSelectedMessageContext: () => {
      if (!conversationId || !selectedEventId) {
        return null;
      }
      return { conversationId, selectedEventId, title: conversationTitle ?? null };
    },
    cancelInFlightGeneration: () => {
      sendAbort?.abort();
    },
    dispose: () => {
      subscription.dispose();
      colcoorNotesChannel.dispose();
      disposePanel();
    },
  };
}
