import * as vscode from "vscode";
import type { AgentRunner } from "../agent/agentRunner";
import type {
  ColcoorApiClient,
  ConversationMember,
  ConversationSummary,
  GraphEventNode,
  MeOut,
  NoteOut,
  SideChatMessageOut,
  SideChatPostBody,
} from "../api/client";
import { confirmDestructiveActionByTypingDelete } from "./destructiveDeleteConfirm";
import { countSubtreeNodes, SUBTREE_TYPED_DELETE_THRESHOLD } from "./destructiveDeleteCount";
import { isPlanLimitColcoorApiError } from "../api/colcoorApiHttpError";
import { createAssistantStreamPusher } from "./assistantStreamWebview";
import {
  COLCOOR_CONVERSATION_PANEL_OPEN_CONTEXT,
  COLCOOR_CONVERSATION_REPLY_IN_PROGRESS_CONTEXT,
} from "./colcoorContextKeys";
import { isSafeHttpUrlForWebview, listLegalPolicyLinksFromColcoorWorkspaceSection } from "./legalPolicySection";
import { getConversationWebviewHtml } from "./conversationWebviewHtml";
import { buildConversationDrawersModel, type TodoDrawerRow, type StarredDrawerRow } from "./drawersModel";
import { runResendAssistant } from "./resendAssistant";
import {
  normalizeOptionalGraphEventId,
  normalizePersistedUserInputText,
} from "./normalizeUserInputText";
import { buildUserImageDataUrlsByEventId } from "./conversationImageDataUrls";
import { runColcoorUserTurn } from "./runUserTurn";
import { appendPendingPlainThreadFragment, buildPlainThread } from "./threadPlainText";
import { buildThreadSegments, type ThreadSegment } from "./threadSegments";
import { pendingUserHtmlForPanelState } from "./pendingUserHtmlForPanelState";
import {
  staleTreeMissingSelectionPromptKey,
  staleTreeRemoteCollaboratorGrowthFingerprint,
} from "./staleTreePromptPolicy";
import { TREE_NODE_CONTEXT_MENU_ENTRIES } from "./treeNodeContextMenu";
import { pruneCollapsedEventIdsForStorage } from "./treeCollapseIds";
import {
  COMPOSER_TEXTAREA_HEIGHT_STATE_KEY,
  clampComposerTextareaHeightPx,
} from "./composerLayoutPersistence";
import { evaluateContinueFromHere } from "./continueFromHereGate";
import { clipboardTextForSelectedTreeMessage } from "./selectedMessageClipboardText";
import { evaluateResendAssistantGate } from "./resendAssistantGate";
import { findBranchTip, trimmedGraphCheckpointLabel } from "./treeEvents";
import { normalizedConversationTitle } from "../conversations/renameConversationTitle";
import {
  COLOOR_API_FAILURE_REFRESH_CONVERSATION_TREE_ACTION,
  COLOOR_REFRESH_CONVERSATION_TREE_PANEL_BUTTON_LABEL,
} from "../util/colcoorApiFailureActions";
import { showColcoorApiFailure } from "../util/showColcoorApiFailure";
import { sideChatOpenButtonCopy } from "./sideChatOpenButtonLabel";
import {
  buildUserMediaContentJson,
  parseDataUrlToBytes,
  parseUserMediaImages,
} from "./userEventMedia";
import type { ColcoorUserMediaImageRef } from "./userEventMedia";
import { buildUserImageDataUrlsByOwnerId } from "./conversationImageDataUrls";
import { mergeSideChatMessage } from "../sidechat/mergeSideChatMessage";
import {
  buildOptimisticSideChatUserMessage,
  isOptimisticSideChatMessageId,
  newOptimisticSideChatMessageId,
} from "../sidechat/optimisticSideChatUserMessage";
import { maxSideChatSeq } from "../sidechat/sideChatReadCursor";
import { nextSideChatReadSeqToPatch } from "../sidechat/sideChatReadPatchPlan";
import { buildSideChatSendPayload } from "../sidechat/sideChatSendPayload";
import { toSideChatRenderMessages, type SideChatRenderMessage } from "../sidechat/sideChatRenderMessages";
import { listConversationsCached } from "../conversations/conversationsListCache";
import { runInlineSideChatSseLoop } from "../sidechat/runInlineSideChatSseLoop";
import { mentionTargetsForMe } from "../sidechat/sideChatMentionTargets";
import { shouldNotifyForIncomingSideChatMessage } from "../sidechat/sideChatNotifyDedup";
import { shouldEmitSideChatNotificationNow } from "../sidechat/sideChatNotificationRateLimit";
import { decideSideChatNotification } from "../sidechat/sideChatNotifications";
import { decideSideChatSoundKind } from "../sidechat/sideChatSoundDecision";
import { readSideChatCueSettings } from "../sidechat/sideChatWorkspaceSettings";
import { sideChatMessageHasUnknownReferenceLookups } from "../sidechat/sideChatReferenceLookupPolicy";
import { trimmedSideChatSendBody } from "../sidechat/trimSendBody";
import { normalizeSideChatReferenceId } from "../sidechat/normalizeSideChatReferenceId";
import {
  canDeleteSideChatMessage,
  canMutateOwnSideChatUserMessage,
} from "../sidechat/sideChatMessageActions";

const TREE_WIDTH_STATE_KEY = "colcoor.conversation.treeWidthPx";
const SIDE_CHAT_COLUMN_WIDTH_STATE_KEY = "colcoor.conversation.sideChatColumnWidthPx";
/** `conversation_id` → event ids whose branches are collapsed in the webview tree ([tree-ui-contract.md]). */
const TREE_COLLAPSED_BY_CONV_KEY = "colcoor.treeCollapsedByConversation";
const colcoorNotesChannel = vscode.window.createOutputChannel("Colcoor notes");

/** Staged main-thread sends while the assistant is still generating the reply to the active user line. */
type QueuedMainSendItem =
  | { kind: "after_assistant"; text: string; images?: { dataUrl: string }[] }
  | { kind: "new_branch"; text: string; images?: { dataUrl: string }[]; privateBranch: boolean };

/** Optional server snapshots for `revealAtEvent` to skip redundant GETs after a palette/drawer fetch. */
export type RevealAtEventPrefetchOptions = {
  prefetchedTreeEvents?: GraphEventNode[];
  prefetchedNotes?: NoteOut[];
};

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
  /** Workspace-persisted side-chat column width (px), when set. */
  sideChatColumnWidthPx: number | null;
  /** Workspace-persisted composer textarea height (px), when set. */
  composerTextareaHeightPx: number | null;
  /** Collapsed branch roots for this conversation (pruned to current `events`). */
  treeCollapsedEventIds: string[];
  /** Settings: expand CLI trace `<details>` by default. */
  agentTraceOpen: boolean;
  /** Server flag: next send should rebuild transcript from full path (domain-model §4). */
  needsContextRebuild: boolean;
  busy: boolean;
  /** True while the host is fetching the conversation tree (open, switch, or refresh). */
  conversationLoading: boolean;
  lastError: string | null;
  /** Terms / Privacy / Refund from workspace settings ([ui-features.md] §1.3). */
  legalPolicyLinks: { label: string; url: string }[];
  /** Side-chat unread (from GET /conversations) for the Open side chat button ([ui-features.md] §10). */
  sideChatOpenButtonLabel: string;
  sideChatOpenButtonTitle: string;
  /** Unread row count for inline side-chat scroll-to-first-unread on open (same source as button badge). */
  sideChatUnreadCount: number;
  /** In-flight send: sanitized markdown for the user line before the server persists it ([ui-features.md] §7). */
  pendingUserHtml: string | null;
  /** Inline side-chat drawer in the same conversation tab. */
  sideChatVisible: boolean;
  sideChatMessages: SideChatRenderMessage[];
  /** Server read cursor for inline side-chat unread markers (seq strictly greater than this). */
  sideChatLastReadSeq: number;
  /** Current user id for inline side-chat (caller-state `user_id` or profile); hides unread dot on own rows. */
  viewerUserId: string | null;
  /** Caller's role in this conversation (for owner-only side-chat delete). */
  sideChatViewerRole: "owner" | "editor" | "viewer" | null;
  /** Notes for this conversation (client-side search in the webview). */
  conversationNotes: NoteOut[];
  /** Starred / TODO rows for the in-tab lists drawer (same source as conversation drawers). */
  drawersStarred: StarredDrawerRow[];
  drawersTodos: TodoDrawerRow[];
  /** Client-only visited selection stack (max ~20); thread ← / → controls. */
  selectionVisitCanGoBack: boolean;
  selectionVisitCanGoForward: boolean;
  /** True after the in-flight user line is persisted and until the assistant run finishes ([ui-features.md] §7). */
  waitingForAssistant: boolean;
  /** Messages staged while {@link waitingForAssistant}; flushed after the current assistant reply. */
  queuedMainSendCount: number;
  /** Members of this conversation (side-chat @ autocomplete and mention tooltips). */
  sideChatMentionMembers: {
    user_id: string;
    display_name: string | null;
    handle: string | null;
    email: string | null;
  }[];
  /** Normalized lowercase @-tokens that refer to the viewer (side-chat “mentioned you” row styling). */
  sideChatMyMentionTargets: string[];
};

type FromWebview =
  | { type: "ready" }
  | {
      type: "send";
      text: string;
      privateBranch?: boolean;
      /** Pasted images as data URLs (image/* only); host uploads then appends colcoor_user_media. */
      images?: { dataUrl: string }[];
      /**
       * When a main-thread reply is already generating: queue under the pending assistant reply,
       * or start a sibling branch from the anchor of the in-flight send (`privateBranch` follows the composer checkbox).
       */
      busySendMode?: "queue" | "branch";
    }
  | { type: "select"; id: string }
  | { type: "selectionHistoryBack" }
  | { type: "selectionHistoryForward" }
  | { type: "treeContextMenu"; id: string }
  | { type: "selectTip" }
  | { type: "refresh" }
  | { type: "cancel" }
  | { type: "resend" }
  | { type: "copy"; text: string }
  | { type: "copyThread"; text: string }
  | {
      type: "layout";
      treeWidthPx?: number;
      composerTextareaHeightPx?: number;
      sideChatColumnWidthPx?: number;
    }
  | { type: "referenceInSideChat" }
  | { type: "referenceNoteInSideChat" }
  | { type: "openMembers" }
  | { type: "addMember" }
  | { type: "changeMemberRole" }
  | { type: "removeMember" }
  | { type: "openSideChat" }
  | { type: "closeSideChat" }
  | { type: "refreshSideChat" }
  | {
      type: "sendSideChat";
      text: string;
      images?: { dataUrl: string }[];
      referencedSideChatMessageId?: string | null;
    }
  | { type: "editSideChat"; messageId: string; text: string }
  | { type: "deleteSideChat"; messageId: string }
  | { type: "deleteConversation" }
  | { type: "openColcoorHub" }
  /** Help panel (product info + policies); same as Colcoor: Help. */
  | { type: "openHelp" }
  /** Account / settings commands invoked from the webview menu (allowlist only). */
  | { type: "executeColcoorCommand"; command: string }
  | { type: "openLegalPolicyUrl"; url: string }
  | {
      type: "searchHit";
      target:
        | { kind: "tree"; eventId: string }
        | { kind: "note"; eventId: string; noteId: string }
        | { kind: "sidechat"; seq: number };
    }
  | { type: "rename" }
  | { type: "togglePin" }
  | { type: "toggleStar" }
  | { type: "addNote" }
  | { type: "editMessageTitle" }
  | { type: "listNotesOnSelection" }
  | { type: "deleteMessageBranch" }
  | { type: "treeCollapse"; collapsedEventIds: string[] }
  | { type: "editNote"; noteId: string }
  | { type: "deleteNote"; noteId: string };

/** Webview may only run these via {@link FromWebview} `executeColcoorCommand` (Account menu). */
const WEBVIEW_ACCOUNT_COMMAND_ALLOWLIST = new Set<string>([
  "colcoor.editProfile",
  "colcoor.openSettings",
  "colcoor.openLegalPolicySettings",
  "colcoor.openSideChatSoundSettings",
  "colcoor.setupCursorCli",
  "colcoor.setCursorAgentApiKey",
  "colcoor.signOut",
]);

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
  revealAtEvent: (
    conversationId: string,
    title: string | null,
    eventId: string,
    prefetch?: RevealAtEventPrefetchOptions,
  ) => Promise<void>;
  /** Close the webview panel if it is showing this conversation (e.g. after delete). */
  closeIfShowingConversation: (conversationId: string) => void;
  /** Star or unstar the selected tree node via API (command palette). */
  toggleStarSelectedMessage: () => Promise<void>;
  /** Attach a note to the selected event (owner/editor); refreshes tree. */
  addNoteToSelectedMessage: () => Promise<void>;
  /** List notes for the selected event in the “Colcoor notes” output channel. */
  showNotesOnSelectedMessage: () => Promise<void>;
  /** Current conversation + selected event (for cross-panel actions like side-chat references). */
  getSelectedMessageContext: () => {
    conversationId: string;
    selectedEventId: string;
    title: string | null;
    /** When the main tree is loaded; reuse to avoid duplicate `listNotes` in reference flows. */
    cachedNotesForConversation?: readonly NoteOut[];
  } | null;
  /** Abort in-flight send/resend in this panel (same as the webview Stop button). No-op if idle. */
  cancelInFlightGeneration: () => void;
  /** Persist active node to the selected tree message (same as detail bar “Continue from here”). */
  continueFromHere: () => Promise<void>;
  /** Regenerate assistant under the selected user message (same as detail bar Resend). */
  resendAssistant: () => Promise<void>;
  /** Select the default-branch tip (same as detail bar “Jump to latest”). */
  jumpToLatestInConversation: () => Promise<void>;
  /** Copy selected tree message body to the system clipboard ([ui-features.md] §7). */
  copySelectedMessage: () => Promise<void>;
  /** Reload tree + thread from the API (same as webview “Refresh conversation tree”). */
  refreshConversationTree: (opts?: { quiet?: boolean }) => Promise<void>;
  /** Soft-delete the selected node and its subtree (owner/editor). */
  deleteSelectedMessageSubtree: () => Promise<void>;
  /** Conversation id when a conversation is open in the panel (selection optional). */
  getLoadedConversationId: () => string | undefined;
  /** Prompt for a soft-deleted event id and restore its subtree (owner/editor). */
  restoreMessageBranchFromPalette: () => Promise<void>;
  /** Show inline side-chat drawer in this conversation tab. */
  openInlineSideChat: () => Promise<void>;
  dispose: () => void;
} {
  const { api, agent, getWorkspaceRoot } = options;

  let panel: vscode.WebviewPanel | undefined;
  let webviewReady = false;
  let conversationId: string | undefined;
  let conversationTitle: string | null | undefined;
  let conversationPinned = false;
  /** Side-chat unread for the open conversation (from list row or parallel list fetch). */
  let sideChatUnreadCount = 0;
  let sideChatHasUnread = false;
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

  function syncConversationPanelOpenContext(): void {
    const open = panel != null && conversationId != undefined;
    void vscode.commands.executeCommand("setContext", COLCOOR_CONVERSATION_PANEL_OPEN_CONTEXT, open);
  }

  /** Last successful tree payload for lightweight UI refresh (e.g. settings). */
  let lastTreeEvents: GraphEventNode[] = [];
  /** Last GET …/members payload (side-chat @ mentions). */
  let lastConversationMembers: ConversationMember[] = [];
  /** Notes list aligned with the last successful tree load (for thread rendering without extra round-trips). */
  let lastNotes: NoteOut[] = [];
  /** From GET …/caller-state after each successful tree load (domain-model §4). */
  let lastNeedsContextRebuild = false;
  /** One-time dedupe key for stale-tree prompt when selected node disappears after refresh. */
  let staleTreePromptedForEventId: string | null = null;
  /** Dedupe for “remote collaborator posted” growth prompt ([ui-features.md] §11). */
  let staleTreePromptedForGrowthFingerprint: string | null = null;
  /** Cached GET /me id — avoids repeated calls when checking collaborative tree growth. */
  let viewerUserIdMemo: string | undefined;
  /** Set while a main-thread send is in flight until the user message exists on the tree ([ui-features.md] §7). */
  let pendingSendUserMarkdown: string | undefined;
  let pendingMainSendQueue: QueuedMainSendItem[] = [];
  /** `selectedEventId` when the primary in-flight send started; used for queued “new branch” items. */
  let busyAnchorParentEventId: string | undefined;
  /** Data URLs for `user_input` rows with `colcoor_user_media`, built on each tree refresh for thread HTML. */
  let lastUserImageDataUrlsByEventId: ReadonlyMap<string, readonly string[]> = new Map();
  /** Inline side-chat rows + rendered rows for same-tab drawer. */
  let inlineSideChatRows: SideChatMessageOut[] = [];
  /** Image data URLs keyed by side-chat message id (incremental fetches per row). */
  let inlineSideChatUrlsByMessageId = new Map<string, string[]>();
  let inlineSideChatRendered: SideChatRenderMessage[] = [];
  let inlineSideChatVisible = false;
  /** From GET …/caller-state `side_chat_last_read_seq` (inline side-chat unread markers + read PATCH). */
  let lastSideChatReadSeq = 0;
  /** Conversations where the user closed inline side chat — skip auto-open for multi-member. */
  const dismissedInlineSideChatByConversationId = new Set<string>();
  /** Serializes inline side-chat POSTs; each user send appends an optimistic row then chains onto this. */
  let inlineSideChatPostChain: Promise<void> = Promise.resolve();
  /** Cached GET /me for optimistic side-chat author line (primed on first inline send). */
  let myProfileForSideChat: MeOut | null | undefined = undefined;
  /** In-flight shared promise so concurrent callers do not duplicate GET /me. */
  let ensureMeForSideChatInFlight: Promise<MeOut | null> | undefined;
  /** From GET …/caller-state `user_id` for the open conversation (inline side-chat “own message” unread UI). */
  let viewerUserIdForWebview: string | null = null;
  /** Caller's membership role for inline side-chat delete rules. */
  let viewerConversationRole: ConversationMember["role"] | null = null;
  /** Tree/note labels for side-chat reference chips (aligned with cached tree + notes). */
  let sideChatEventLabelsById: Record<string, string> = {};
  let sideChatNoteLabelsById: Record<string, string> = {};
  let sideChatSseAbort: AbortController | undefined;
  let inlineSideChatSseConversationId: string | undefined;
  const inlineSideChatNotifiedMessageIds = new Set<string>();
  let inlineSideChatLastNotificationAtMs: number | null = null;
  let inlineSideChatListRefreshTimer: ReturnType<typeof setTimeout> | undefined;
  /** Last state flags sent to webview; reused for lightweight local selection refreshes. */
  let lastPostedBusy = false;
  let lastPostedError: string | null = null;
  /** True between the first `postState` of a tree load and the final snapshot (clears stale error UI). */
  let conversationTreeLoading = false;

  /** Client-only stack of visited tree selections (not persisted; capped). */
  const VISITED_SELECTION_MAX = 20;
  let visitedSelectionStack: string[] = [];
  let visitedSelectionIndex = -1;
  let suppressVisitedSelectionRecording = false;

  function resetVisitedSelectionHistory(): void {
    visitedSelectionStack = [];
    visitedSelectionIndex = -1;
  }

  function visitedSelectionNavFlags(): { canGoBack: boolean; canGoForward: boolean } {
    return {
      canGoBack: visitedSelectionIndex > 0,
      canGoForward:
        visitedSelectionIndex >= 0 && visitedSelectionIndex < visitedSelectionStack.length - 1,
    };
  }

  /** Record a user-visible selection after `postState` has settled `sel` (skips duplicates and history replay). */
  function maybeRecordVisitedSelectionAfterPost(finalSel: string): void {
    if (suppressVisitedSelectionRecording) {
      return;
    }
    const fid = String(finalSel || "").trim();
    if (!fid) {
      return;
    }
    if (visitedSelectionIndex >= 0 && visitedSelectionIndex < visitedSelectionStack.length - 1) {
      visitedSelectionStack = visitedSelectionStack.slice(0, visitedSelectionIndex + 1);
    }
    const tail = visitedSelectionStack[visitedSelectionIndex];
    if (tail === fid) {
      return;
    }
    visitedSelectionStack.push(fid);
    while (visitedSelectionStack.length > VISITED_SELECTION_MAX) {
      visitedSelectionStack.shift();
    }
    visitedSelectionIndex = visitedSelectionStack.length - 1;
  }

  function noteCountsByEventId(notes: readonly NoteOut[]): Map<string, number> {
    const out = new Map<string, number>();
    for (const n of notes) {
      out.set(n.event_id, (out.get(n.event_id) ?? 0) + 1);
    }
    return out;
  }

  /** Refresh `lastNotes` + per-node `note_count` from the server without reloading the full tree. */
  async function mergeNotesIntoCachedTreeAndPost(): Promise<void> {
    if (!conversationId) {
      return;
    }
    if (lastTreeEvents.length === 0) {
      await loadTreeAndPush(lastPostedBusy, lastPostedError);
      return;
    }
    try {
      const notes = await api.listNotes(conversationId);
      lastNotes = notes;
      const counts = noteCountsByEventId(notes);
      lastTreeEvents = lastTreeEvents.map((e) => ({
        ...e,
        note_count: counts.get(e.id) ?? 0,
      }));
      postState(lastTreeEvents, lastPostedBusy, lastPostedError);
    } catch (e) {
      if (isPlanLimitColcoorApiError(e)) {
        void showColcoorApiFailure(e);
      }
      const msg = e instanceof Error ? e.message : String(e);
      await loadTreeAndPush(lastPostedBusy, msg);
    }
  }
  /**
   * Serialize tree fetches + postMessage so overlapping refreshes (e.g. tree click during send)
   * cannot apply an older GET /tree after a newer one and leave the UI stuck on a root-only snapshot.
   */
  let treeRefreshMutexChain: Promise<void> = Promise.resolve();

  async function withTreeRefreshLock<T>(fn: () => Promise<T>): Promise<T> {
    const prev = treeRefreshMutexChain;
    let release!: () => void;
    const next = new Promise<void>((res) => {
      release = res;
    });
    treeRefreshMutexChain = prev.then(() => next);
    await prev;
    try {
      return await fn();
    } finally {
      release();
    }
  }

  function applySideChatUnreadFromListRow(row: ConversationSummary | undefined): void {
    if (!row) {
      return;
    }
    sideChatUnreadCount = Math.max(0, Number(row.side_chat_unread_count ?? 0) || 0);
    sideChatHasUnread = Boolean(row.side_chat_has_unread) || sideChatUnreadCount > 0;
  }

  function applyConversationMetaFromListRow(row: ConversationSummary | undefined): void {
    if (row) {
      conversationPinned = row.pinned;
      conversationTitle = row.title;
      applySideChatUnreadFromListRow(row);
    }
  }

  function shortTreeEventLabelForSideChat(ev: GraphEventNode): string {
    const t = (ev.content_text ?? "").replace(/\s+/g, " ").trim();
    return t ? t.slice(0, 32) : ev.kind;
  }

  function shortTreeNoteLabelForSideChat(n: NoteOut): string {
    const t = n.content.replace(/\s+/g, " ").trim();
    return t ? t.slice(0, 32) : "(empty note)";
  }

  function syncSideChatReferenceLabelMapsFromTree(events: GraphEventNode[], notes: NoteOut[]): void {
    const e: Record<string, string> = {};
    for (const ev of events) {
      e[ev.id] = shortTreeEventLabelForSideChat(ev);
    }
    const n: Record<string, string> = {};
    for (const note of notes) {
      n[note.id] = shortTreeNoteLabelForSideChat(note);
    }
    sideChatEventLabelsById = e;
    sideChatNoteLabelsById = n;
  }

  async function augmentSideChatLabelMapsFromApi(): Promise<void> {
    if (!conversationId) {
      return;
    }
    try {
      const [{ events }, notes] = await Promise.all([
        api.getTree(conversationId),
        api.listNotes(conversationId),
      ]);
      for (const ev of events) {
        sideChatEventLabelsById[ev.id] = shortTreeEventLabelForSideChat(ev);
      }
      for (const note of notes) {
        sideChatNoteLabelsById[note.id] = shortTreeNoteLabelForSideChat(note);
      }
    } catch {
      /* keep previous maps */
    }
  }

  function stopInlineSideChatSse(): void {
    sideChatSseAbort?.abort();
    sideChatSseAbort = undefined;
    inlineSideChatSseConversationId = undefined;
  }

  function ensureInlineSideChatSseForConversation(): void {
    if (!conversationId || !panel || !webviewReady) {
      return;
    }
    if (
      inlineSideChatSseConversationId === conversationId &&
      sideChatSseAbort != null &&
      !sideChatSseAbort.signal.aborted
    ) {
      return;
    }
    stopInlineSideChatSse();
    const cid = conversationId;
    const ac = new AbortController();
    sideChatSseAbort = ac;
    inlineSideChatSseConversationId = cid;

    void runInlineSideChatSseLoop({
      api,
      conversationId: cid,
      getAfterSeq: () => maxSideChatSeq(inlineSideChatRows),
      signal: ac.signal,
      stopped: () =>
        inlineSideChatSseConversationId !== cid || conversationId !== cid || panel == null,
      onJsonPayload: async (payload: unknown) => {
        if (conversationId !== cid || panel == null) {
          return;
        }
        const o = payload as { type?: string; message?: SideChatMessageOut };
        if (o?.type !== "side_chat" || !o.message) {
          return;
        }
        const incoming = o.message;
        const watchingSideChat = Boolean(panel.visible && inlineSideChatVisible);
        const me = await ensureMeForSideChat();
        const cue = readSideChatCueSettings(vscode.workspace.getConfiguration("colcoor"));
        const soundKind = decideSideChatSoundKind({
          panelVisible: watchingSideChat,
          myUserId: me?.id ?? null,
          myMentionTargets: mentionTargetsForMe(me),
          incoming,
          messageSoundEnabled: cue.messageSoundEnabled,
          mentionSoundEnabled: cue.mentionSoundEnabled,
        });
        if (soundKind && webviewReady) {
          try {
            await panel.webview.postMessage({ type: "playSound", kind: soundKind });
          } catch {
            /* webview gone */
          }
        }
        if (
          shouldNotifyForIncomingSideChatMessage(inlineSideChatRows, incoming, inlineSideChatNotifiedMessageIds)
        ) {
          const notif = decideSideChatNotification({
            panelVisible: watchingSideChat,
            myUserId: me?.id ?? null,
            myMentionTargets: mentionTargetsForMe(me),
            incoming,
            notificationsEnabled: cue.notificationsEnabled,
            mentionNotificationsEnabled: cue.mentionNotificationsEnabled,
          });
          if (notif) {
            const nowMs = Date.now();
            if (
              shouldEmitSideChatNotificationNow({
                nowMs,
                lastNotificationAtMs: inlineSideChatLastNotificationAtMs,
                decision: notif,
              })
            ) {
              inlineSideChatLastNotificationAtMs = nowMs;
              void vscode.window.showInformationMessage(notif.title, {
                detail: notif.detail,
                modal: false,
              });
            }
          }
        }
        inlineSideChatNotifiedMessageIds.add(incoming.id);
        await incorporateInlineSideChatFromRemote(incoming);
      },
    });
  }

  async function incorporateInlineSideChatFromRemote(inc: SideChatMessageOut): Promise<void> {
    if (!conversationId) {
      return;
    }
    const incRefsUnknown = sideChatMessageHasUnknownReferenceLookups(
      inc,
      sideChatEventLabelsById,
      sideChatNoteLabelsById,
    );
    if (incRefsUnknown) {
      await augmentSideChatLabelMapsFromApi();
    }
    inlineSideChatRows = mergeSideChatMessage(inlineSideChatRows, inc);
    if (inc.kind === "user" && parseUserMediaImages(inc.content_json ?? undefined).length > 0) {
      try {
        const partial = await buildUserImageDataUrlsByOwnerId(api, conversationId, [inc]);
        for (const [id, urls] of partial) {
          inlineSideChatUrlsByMessageId.set(id, [...urls]);
        }
      } catch {
        /* keep cached URLs */
      }
    } else if (inc.kind === "user") {
      inlineSideChatUrlsByMessageId.delete(inc.id);
    }
    const cachedIds = new Set(inlineSideChatRows.map((m) => m.id));
    for (const k of inlineSideChatUrlsByMessageId.keys()) {
      if (!cachedIds.has(k)) {
        inlineSideChatUrlsByMessageId.delete(k);
      }
    }
    rebuildInlineSideChatRendered();
    postState(lastTreeEvents, lastPostedBusy, lastPostedError);
    await markInlineSideChatReadFromCache(true);
    await refreshConversationMeta();
    if (inc.kind === "system_join") {
      void vscode.commands.executeCommand("colcoor.refreshConversations");
    }
  }

  function rebuildInlineSideChatRendered(): void {
    inlineSideChatRendered = toSideChatRenderMessages(
      inlineSideChatRows,
      { eventLabelsById: sideChatEventLabelsById, noteLabelsById: sideChatNoteLabelsById },
      inlineSideChatUrlsByMessageId,
    );
  }

  async function ensureMeForSideChat(): Promise<MeOut | null> {
    if (myProfileForSideChat !== undefined) {
      return myProfileForSideChat;
    }
    ensureMeForSideChatInFlight ??= (async () => {
      try {
        myProfileForSideChat = await api.getMe();
      } catch {
        myProfileForSideChat = null;
      } finally {
        ensureMeForSideChatInFlight = undefined;
      }
      return myProfileForSideChat ?? null;
    })();
    return ensureMeForSideChatInFlight;
  }

  async function refreshInlineSideChat(): Promise<void> {
    if (!conversationId) {
      inlineSideChatRows = [];
      inlineSideChatUrlsByMessageId = new Map();
      inlineSideChatRendered = [];
      return;
    }
    const rows = await api.listSideChatMessages(conversationId, 0);
    inlineSideChatRows = rows;
    let urlsByMessageId = new Map<string, string[]>();
    try {
      urlsByMessageId = await buildUserImageDataUrlsByOwnerId(
        api,
        conversationId,
        rows.filter((m) => m.kind === "user"),
      );
    } catch {
      urlsByMessageId = new Map();
    }
    inlineSideChatUrlsByMessageId = urlsByMessageId;
    rebuildInlineSideChatRendered();
    for (const r of inlineSideChatRows) {
      inlineSideChatNotifiedMessageIds.add(r.id);
    }
  }

  /**
   * PATCH side-chat read cursor to the latest stable seq in `inlineSideChatRows`.
   * When `onlyIfDrawerVisible`, skips if the user has collapsed inline side chat (tree refresh should not
   * clear unread for a drawer they have not opened this session).
   */
  async function markInlineSideChatReadFromCache(onlyIfDrawerVisible: boolean): Promise<void> {
    if (!conversationId || (onlyIfDrawerVisible && !inlineSideChatVisible) || inlineSideChatRows.length === 0) {
      return;
    }
    const stableRows = inlineSideChatRows.filter((row) => !isOptimisticSideChatMessageId(row.id));
    if (stableRows.length === 0) {
      return;
    }
    const m = maxSideChatSeq(stableRows);
    const nextRead = nextSideChatReadSeqToPatch(m, lastSideChatReadSeq, true);
    if (nextRead == null) {
      return;
    }
    try {
      await api.patchSideChatRead(conversationId, nextRead);
      lastSideChatReadSeq = nextRead;
      await refreshConversationMeta();
      if (inlineSideChatListRefreshTimer !== undefined) {
        clearTimeout(inlineSideChatListRefreshTimer);
      }
      inlineSideChatListRefreshTimer = setTimeout(() => {
        inlineSideChatListRefreshTimer = undefined;
        void vscode.commands.executeCommand("colcoor.refreshConversations");
      }, 1500);
    } catch (e) {
      if (isPlanLimitColcoorApiError(e)) {
        void showColcoorApiFailure(e);
      }
    }
  }

  async function postOneInlineSideChatJob(job: {
    conversationId: string;
    tempId: string;
    payload: SideChatPostBody;
  }): Promise<void> {
    if (conversationId !== job.conversationId) {
      inlineSideChatRows = inlineSideChatRows.filter((m) => m.id !== job.tempId);
      inlineSideChatUrlsByMessageId.delete(job.tempId);
      rebuildInlineSideChatRendered();
      if (panel && webviewReady) {
        postState(lastTreeEvents, sendAbort != null, null);
      }
      return;
    }
    try {
      const created = await api.postSideChatMessage(job.conversationId, job.payload);
      inlineSideChatRows = inlineSideChatRows.filter((m) => m.id !== job.tempId);
      inlineSideChatUrlsByMessageId.delete(job.tempId);
      inlineSideChatRows = mergeSideChatMessage(inlineSideChatRows, created);
      if (created.kind === "user" && parseUserMediaImages(created.content_json ?? undefined).length > 0) {
        try {
          const partial = await buildUserImageDataUrlsByOwnerId(api, job.conversationId, [created]);
          for (const [id, urls] of partial) {
            inlineSideChatUrlsByMessageId.set(id, [...urls]);
          }
        } catch {
          /* keep pasted preview until next full refresh if signed URLs fail */
        }
      } else if (created.kind === "user") {
        inlineSideChatUrlsByMessageId.delete(created.id);
      }
      rebuildInlineSideChatRendered();
      postState(lastTreeEvents, sendAbort != null, null);
      await markInlineSideChatReadFromCache(true);
      await refreshConversationMeta();
    } catch (e) {
      inlineSideChatRows = inlineSideChatRows.filter((m) => m.id !== job.tempId);
      inlineSideChatUrlsByMessageId.delete(job.tempId);
      rebuildInlineSideChatRendered();
      postState(lastTreeEvents, sendAbort != null, null);
      await showColcoorApiFailure(e);
    }
  }

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
      const rows = await listConversationsCached(api);
      applyConversationMetaFromListRow(rows.find((r) => r.id === conversationId));
    } catch {
      /* keep previous meta */
    }
  }

  function disposePanel(): void {
    stopInlineSideChatSse();
    inlineSideChatNotifiedMessageIds.clear();
    inlineSideChatLastNotificationAtMs = null;
    if (inlineSideChatListRefreshTimer !== undefined) {
      clearTimeout(inlineSideChatListRefreshTimer);
      inlineSideChatListRefreshTimer = undefined;
    }
    sendAbort?.abort();
    sendAbort = undefined;
    syncConversationReplyInProgressContext();
    panel?.dispose();
    panel = undefined;
    webviewReady = false;
    lastTreeEvents = [];
    lastConversationMembers = [];
    lastNotes = [];
    lastNeedsContextRebuild = false;
    lastUserImageDataUrlsByEventId = new Map();
    sideChatUnreadCount = 0;
    sideChatHasUnread = false;
    lastSideChatReadSeq = 0;
    viewerUserIdForWebview = null;
    viewerConversationRole = null;
    inlineSideChatUrlsByMessageId = new Map();
    inlineSideChatPostChain = Promise.resolve();
    myProfileForSideChat = undefined;
    ensureMeForSideChatInFlight = undefined;
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

  /**
   * Read cursor sent to the webview for unread dots only. When GET …/caller-state omits or returns 0 for
   * `side_chat_last_read_seq` but the conversation list says there are no unreads, infer at least max(seq)
   * from the loaded inline rows so already-read messages are not all highlighted.
   */
  function effectiveSideChatLastReadSeqForWebview(): number {
    const L = lastSideChatReadSeq;
    if (!inlineSideChatVisible || inlineSideChatRows.length === 0) {
      return L;
    }
    const maxS = maxSideChatSeq(inlineSideChatRows);
    // Caller read seq missing or stuck at 0 while list says no unreads — treat as caught up for dots only.
    if (L === 0 && sideChatUnreadCount === 0 && maxS > 0) {
      return maxS;
    }
    if (L === 0 && sideChatUnreadCount > 0 && maxS > 0) {
      const u = Math.min(sideChatUnreadCount, inlineSideChatRows.length);
      return Math.max(0, maxS - u);
    }
    return L;
  }

  function postState(
    events: GraphEventNode[],
    busy: boolean,
    lastError: string | null,
  ): void {
    if (!panel || !conversationId || !webviewReady) {
      return;
    }
    syncSideChatReferenceLabelMapsFromTree(events, lastNotes);
    try {
      lastPostedBusy = busy;
      lastPostedError = lastError;
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
      maybeRecordVisitedSelectionAfterPost(sel ?? "");
      const nav = visitedSelectionNavFlags();
      const treeW = context.workspaceState.get<number>(TREE_WIDTH_STATE_KEY);
      const treeWidthPx =
        typeof treeW === "number" && Number.isFinite(treeW) && treeW >= 140 && treeW < 8000
          ? Math.floor(treeW)
          : null;
      const sideChatW = context.workspaceState.get<number>(SIDE_CHAT_COLUMN_WIDTH_STATE_KEY);
      const sideChatColumnWidthPx =
        typeof sideChatW === "number" && Number.isFinite(sideChatW) && sideChatW >= 160 && sideChatW < 8000
          ? Math.floor(sideChatW)
          : null;
      const composerTextareaHeightPx = clampComposerTextareaHeightPx(
        context.workspaceState.get<number>(COMPOSER_TEXTAREA_HEIGHT_STATE_KEY),
      );
      const agentTraceOpen =
        vscode.workspace.getConfiguration("colcoor").get<boolean>("conversationAgentTraceOpen") ?? true;
      const sideChatBtn = sideChatOpenButtonCopy({
        side_chat_has_unread: sideChatHasUnread,
        side_chat_unread_count: sideChatUnreadCount,
      });
      const pendingUserHtml = pendingUserHtmlForPanelState(busy, pendingSendUserMarkdown);
      const waitingForAssistant = Boolean(sendAbort && pendingSendUserMarkdown === undefined);
      const drawersModel = buildConversationDrawersModel(events, lastNotes);
      const msg: WebviewStateMessage = {
        type: "state",
        conversationId,
        title: conversationTitle ?? null,
        conversationPinned,
        events,
        selectedEventId: sel ?? "",
        threadSegments: buildThreadSegments(events, sel ?? "", lastNotes, lastUserImageDataUrlsByEventId),
        threadPlainText: appendPendingPlainThreadFragment(
          buildPlainThread(events, sel ?? "", lastNotes),
          busy,
          pendingSendUserMarkdown,
        ),
        treeWidthPx,
        sideChatColumnWidthPx,
        composerTextareaHeightPx,
        treeCollapsedEventIds: prunedCollapsedEventIds(events),
        agentTraceOpen,
        needsContextRebuild: lastNeedsContextRebuild,
        busy,
        conversationLoading: conversationTreeLoading,
        lastError,
        legalPolicyLinks: listLegalPolicyLinksFromColcoorWorkspaceSection(
          vscode.workspace.getConfiguration("colcoor"),
        ),
        sideChatOpenButtonLabel: sideChatBtn.label,
        sideChatOpenButtonTitle: sideChatBtn.title,
        sideChatUnreadCount,
        pendingUserHtml,
        sideChatVisible: inlineSideChatVisible,
        sideChatMessages: inlineSideChatRendered,
        sideChatLastReadSeq: effectiveSideChatLastReadSeqForWebview(),
        viewerUserId:
          viewerUserIdForWebview ??
          (typeof myProfileForSideChat?.id === "string" ? myProfileForSideChat.id : null) ??
          (typeof viewerUserIdMemo === "string" ? viewerUserIdMemo : null),
        conversationNotes: lastNotes,
        drawersStarred: drawersModel.starred,
        drawersTodos: drawersModel.todos,
        selectionVisitCanGoBack: nav.canGoBack,
        selectionVisitCanGoForward: nav.canGoForward,
        sideChatViewerRole: viewerConversationRole,
        waitingForAssistant,
        queuedMainSendCount: pendingMainSendQueue.length,
        sideChatMentionMembers: lastConversationMembers.map((m) => ({
          user_id: m.user_id,
          display_name: m.display_name ?? null,
          handle: m.handle ?? null,
          email: m.email ?? null,
        })),
        sideChatMyMentionTargets: mentionTargetsForMe(myProfileForSideChat ?? null),
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
        const sideChatW = context.workspaceState.get<number>(SIDE_CHAT_COLUMN_WIDTH_STATE_KEY);
        const sideChatColumnWidthPx =
          typeof sideChatW === "number" && Number.isFinite(sideChatW) && sideChatW >= 160 && sideChatW < 8000
            ? Math.floor(sideChatW)
            : null;
        const composerTextareaHeightPx = clampComposerTextareaHeightPx(
          context.workspaceState.get<number>(COMPOSER_TEXTAREA_HEIGHT_STATE_KEY),
        );
        const agentTraceOpen =
          vscode.workspace.getConfiguration("colcoor").get<boolean>("conversationAgentTraceOpen") ?? true;
        const sideChatBtnFb = sideChatOpenButtonCopy({
          side_chat_has_unread: sideChatHasUnread,
          side_chat_unread_count: sideChatUnreadCount,
        });
        const drawersModelFb = buildConversationDrawersModel([], lastNotes);
        const fallback: WebviewStateMessage = {
          type: "state",
          conversationId,
          title: conversationTitle ?? null,
          conversationPinned,
          events: [],
          selectedEventId: "",
          threadSegments: [],
          threadPlainText: appendPendingPlainThreadFragment("", busy, pendingSendUserMarkdown),
          treeWidthPx,
          sideChatColumnWidthPx,
          composerTextareaHeightPx,
          treeCollapsedEventIds: [],
          agentTraceOpen,
          needsContextRebuild: false,
          busy,
          conversationLoading: false,
          lastError:
            lastError ??
            `Render failed: ${detail}. If the conversation is very large, try the API or a fresh thread.`,
          legalPolicyLinks: listLegalPolicyLinksFromColcoorWorkspaceSection(
            vscode.workspace.getConfiguration("colcoor"),
          ),
          sideChatOpenButtonLabel: sideChatBtnFb.label,
          sideChatOpenButtonTitle: sideChatBtnFb.title,
          sideChatUnreadCount,
          pendingUserHtml: null,
          sideChatVisible: inlineSideChatVisible,
          sideChatMessages: inlineSideChatRendered,
          sideChatLastReadSeq: effectiveSideChatLastReadSeqForWebview(),
          viewerUserId:
            viewerUserIdForWebview ??
            (typeof myProfileForSideChat?.id === "string" ? myProfileForSideChat.id : null) ??
            (typeof viewerUserIdMemo === "string" ? viewerUserIdMemo : null),
          conversationNotes: lastNotes,
          drawersStarred: drawersModelFb.starred,
          drawersTodos: drawersModelFb.todos,
          selectionVisitCanGoBack: false,
          selectionVisitCanGoForward: false,
          sideChatViewerRole: viewerConversationRole,
          waitingForAssistant: Boolean(sendAbort && pendingSendUserMarkdown === undefined),
          queuedMainSendCount: pendingMainSendQueue.length,
          sideChatMentionMembers: lastConversationMembers.map((m) => ({
            user_id: m.user_id,
            display_name: m.display_name ?? null,
            handle: m.handle ?? null,
            email: m.email ?? null,
          })),
          sideChatMyMentionTargets: mentionTargetsForMe(myProfileForSideChat ?? null),
        };
        void panel.webview.postMessage(fallback);
      } catch {
        /* webview may be gone */
      }
    }
  }

  async function loadTreeAndPush(
    busy: boolean,
    lastError: string | null,
    opts?: {
      finalizeToDefaultBranchTip?: boolean;
      skipConversationsList?: boolean;
      prefetchedTreeEvents?: GraphEventNode[];
      prefetchedNotes?: NoteOut[];
      skipInlineSideChatRefresh?: boolean;
    },
  ): Promise<void> {
    await withTreeRefreshLock(async () => {
      if (!conversationId) {
        return;
      }
      const skipConversationsList = Boolean(opts?.skipConversationsList);
      const skipInlineSideChatRefresh = Boolean(opts?.skipInlineSideChatRefresh);
      let finalizeToDefaultBranchTip = Boolean(opts?.finalizeToDefaultBranchTip);
      let treePrefetch: GraphEventNode[] | undefined = opts?.prefetchedTreeEvents;
      let notesPrefetch: NoteOut[] | undefined = opts?.prefetchedNotes;
      conversationTreeLoading = true;
      postState(lastTreeEvents, lastPostedBusy, null);
      for (;;) {
        try {
          const hadInlineSideChatOpenAtTreeLoad = inlineSideChatVisible;
          const previousSelectedEventId = selectedEventId;
          const previousEventIds = new Set(lastTreeEvents.map((e) => e.id));
          const treeP =
            treePrefetch !== undefined
              ? Promise.resolve({ events: treePrefetch })
              : api.getTree(conversationId);
          const notesP =
            notesPrefetch !== undefined ? Promise.resolve(notesPrefetch) : api.listNotes(conversationId);
          const membersP = api.listConversationMembers(conversationId).catch((): ConversationMember[] => []);
          const [{ events }, notes, caller, listRows, members] = await Promise.all([
            treeP,
            notesP,
            api.getConversationCallerState(conversationId).catch((): null => null),
            skipConversationsList
              ? Promise.resolve([] as ConversationSummary[])
              : listConversationsCached(api).catch((): ConversationSummary[] => []),
            membersP,
          ]);
          if (!skipConversationsList) {
            applyConversationMetaFromListRow(listRows.find((r) => r.id === conversationId));
          }
          const nextEventIds = new Set(events.map((e) => e.id));
          const stalePromptKey = staleTreeMissingSelectionPromptKey({
            previousSelectedEventId,
            previousEventIds,
            nextEventIds,
            alreadyPromptedForEventId: staleTreePromptedForEventId,
          });
          let growthFingerprint: string | null = null;
          if (!busy && !stalePromptKey && previousEventIds.size > 0) {
            const maybeNewUserInput = events.some(
              (e) => !previousEventIds.has(e.id) && e.kind === "user_input",
            );
            if (maybeNewUserInput) {
              if (viewerUserIdMemo === undefined) {
                try {
                  viewerUserIdMemo = (await api.getMe()).id;
                } catch {
                  viewerUserIdMemo = undefined;
                }
              }
              if (viewerUserIdMemo !== undefined) {
                growthFingerprint = staleTreeRemoteCollaboratorGrowthFingerprint({
                  previousEventIds,
                  nextEvents: events,
                  viewerUserId: viewerUserIdMemo,
                  alreadyPromptedFingerprint: staleTreePromptedForGrowthFingerprint,
                });
              }
            }
          }
          lastNotes = notes;
          viewerConversationRole = null;
          if (caller) {
            lastNeedsContextRebuild = Boolean(caller.needs_context_rebuild);
            viewerUserIdForWebview =
              typeof caller.user_id === "string" && caller.user_id.trim() ? caller.user_id.trim() : null;
            const uid = viewerUserIdForWebview;
            if (uid) {
              const mem = members.find((m) => m.user_id === uid);
              viewerConversationRole = mem?.role ?? null;
            }
            const lr = caller.side_chat_last_read_seq;
            lastSideChatReadSeq =
              typeof lr === "number" && Number.isFinite(lr) ? Math.max(0, Math.floor(lr)) : 0;
            const aid = caller.active_event_id;
            if (events.some((e) => e.id === aid)) {
              selectedEventId = aid;
            }
          } else {
            lastNeedsContextRebuild = false;
            lastSideChatReadSeq = 0;
            viewerUserIdForWebview = null;
            viewerConversationRole = null;
          }
          if (selectedEventId && !events.some((e) => e.id === selectedEventId)) {
            const aidRaw = caller?.active_event_id;
            const aid =
              typeof aidRaw === "string" && aidRaw.trim() && events.some((e) => e.id === aidRaw.trim())
                ? aidRaw.trim()
                : undefined;
            if (aid) {
              selectedEventId = aid;
            } else {
              const rootEv = events.find((e) => e.parent_event_id === null);
              selectedEventId = rootEv?.id ?? events.at(-1)?.id;
            }
          }
          if (members.length > 1 && !dismissedInlineSideChatByConversationId.has(conversationId)) {
            inlineSideChatVisible = true;
          }
          if (selectedEventId && nextEventIds.has(selectedEventId)) {
            staleTreePromptedForEventId = null;
          }
          if (!busy && stalePromptKey) {
            staleTreePromptedForEventId = stalePromptKey;
            const choice = await vscode.window.showWarningMessage(
              "Colcoor: the shared tree changed and your previous selection is no longer available.",
              COLOOR_API_FAILURE_REFRESH_CONVERSATION_TREE_ACTION,
            );
            if (choice === COLOOR_API_FAILURE_REFRESH_CONVERSATION_TREE_ACTION) {
              finalizeToDefaultBranchTip = false;
              treePrefetch = undefined;
              notesPrefetch = undefined;
              continue;
            }
          } else if (!busy && growthFingerprint) {
            staleTreePromptedForGrowthFingerprint = growthFingerprint;
            const choice = await vscode.window.showWarningMessage(
              "Colcoor: new collaborative messages were added to this conversation’s tree.",
              COLOOR_API_FAILURE_REFRESH_CONVERSATION_TREE_ACTION,
            );
            if (choice === COLOOR_API_FAILURE_REFRESH_CONVERSATION_TREE_ACTION) {
              finalizeToDefaultBranchTip = false;
              treePrefetch = undefined;
              notesPrefetch = undefined;
              continue;
            }
          }
          if (finalizeToDefaultBranchTip && events.length > 0) {
            try {
              selectedEventId = findBranchTip(events).id;
            } catch {
              selectedEventId = events.at(-1)?.id;
            }
          }
          const imageFetchP = buildUserImageDataUrlsByEventId(api, conversationId, events).catch(
            () => new Map<string, string[]>(),
          );
          const sideChatRefreshP =
            inlineSideChatVisible && !skipInlineSideChatRefresh
              ? refreshInlineSideChat().catch(() => {
                  inlineSideChatRows = [];
                  inlineSideChatUrlsByMessageId = new Map();
                  inlineSideChatRendered = [];
                })
              : Promise.resolve();
          const [imageMap] = await Promise.all([imageFetchP, sideChatRefreshP]);
          lastUserImageDataUrlsByEventId = imageMap;
          if (hadInlineSideChatOpenAtTreeLoad && !skipInlineSideChatRefresh) {
            await markInlineSideChatReadFromCache(true);
          }
          lastConversationMembers = members;
          conversationTreeLoading = false;
          await ensureMeForSideChat();
          postState(events, busy, lastError);
          if (members.length > 1) {
            ensureInlineSideChatSseForConversation();
          } else {
            stopInlineSideChatSse();
          }
          return;
        } catch (e) {
          if (isPlanLimitColcoorApiError(e)) {
            void showColcoorApiFailure(e);
          }
          const msg = e instanceof Error ? e.message : String(e);
          lastNotes = [];
          lastNeedsContextRebuild = false;
          lastSideChatReadSeq = 0;
          viewerUserIdForWebview = null;
          viewerConversationRole = null;
          lastUserImageDataUrlsByEventId = new Map();
          inlineSideChatRows = [];
          inlineSideChatUrlsByMessageId = new Map();
          inlineSideChatRendered = [];
          inlineSideChatPostChain = Promise.resolve();
          lastConversationMembers = [];
          conversationTreeLoading = false;
          postState([], busy, msg);
          return;
        }
      }
    });
  }

  function isWaitingForAssistant(): boolean {
    return sendAbort != null && pendingSendUserMarkdown === undefined;
  }

  async function uploadPastedImagesForMainSend(
    pastedImages: { dataUrl: string }[] | undefined,
  ): Promise<ColcoorUserMediaImageRef[]> {
    const refs: ColcoorUserMediaImageRef[] = [];
    if (!conversationId) {
      return refs;
    }
    for (const row of pastedImages ?? []) {
      const parsed = parseDataUrlToBytes(row.dataUrl);
      if (!parsed) {
        continue;
      }
      const up = await api.uploadConversationImage(conversationId, parsed.bytes, parsed.mimeType);
      refs.push({ id: up.id, mime_type: up.mime_type, byte_size: up.byte_size });
    }
    return refs;
  }

  async function drainMainSendQueue(initialAssistantId: string | undefined): Promise<void> {
    let mainAssistant = initialAssistantId;
    const anchor = busyAnchorParentEventId;
    if (!conversationId || !anchor) {
      return;
    }
    const ws = getWorkspaceRoot();
    const sig = sendAbort?.signal;
    if (!sig) {
      return;
    }
    while (pendingMainSendQueue.length > 0) {
      const item = pendingMainSendQueue.shift()!;
      const stream = createAssistantStreamPusher(() => panel, () => webviewReady);
      try {
        const refs = await uploadPastedImagesForMainSend(item.images);
        const trimmed = normalizePersistedUserInputText(item.text);
        if (!trimmed && refs.length === 0) {
          stream.dispose();
          continue;
        }
        const userMediaContentJson = refs.length > 0 ? buildUserMediaContentJson(refs) : undefined;
        const replyParent = item.kind === "after_assistant" ? mainAssistant ?? undefined : anchor;
        if (item.kind === "after_assistant" && replyParent === undefined) {
          stream.dispose();
          void vscode.window.showWarningMessage(
            "Colcoor: skipped a queued message — no assistant reply to attach under.",
          );
          continue;
        }
        const result = await runColcoorUserTurn(
          api,
          agent,
          conversationId,
          conversationTitle,
          trimmed,
          ws,
          {
            replyParentEventId: replyParent,
            privateBranch: item.kind === "new_branch" ? item.privateBranch : false,
            signal: sig,
            onAssistantTextDelta: (t) => stream.pushDelta(t),
            ...(userMediaContentJson ? { userMediaContentJson } : {}),
            onUserMessagePersisted: async ({ userEventId }) => {
              selectedEventId = userEventId;
              await loadTreeAndPush(true, null, {
                skipConversationsList: true,
                skipInlineSideChatRefresh: true,
              });
            },
          },
        );
        stream.dispose();
        postState(lastTreeEvents, true, lastPostedError);
        if (result.cancelled) {
          break;
        }
        if (item.kind === "after_assistant" && result.assistantEventId) {
          mainAssistant = result.assistantEventId;
        }
      } catch (e) {
        stream.dispose();
        if (isPlanLimitColcoorApiError(e)) {
          void showColcoorApiFailure(e);
        }
        const msg = e instanceof Error ? e.message : String(e);
        await loadTreeAndPush(false, msg);
        break;
      }
    }
  }

  async function handleSend(
    text: string,
    privateBranch: boolean,
    pastedImages?: { dataUrl: string }[],
    busySendMode?: "queue" | "branch",
  ): Promise<void> {
    const trimmed = normalizePersistedUserInputText(text);
    const hasPasted =
      Array.isArray(pastedImages) && pastedImages.some((x) => typeof x?.dataUrl === "string" && x.dataUrl.trim());
    if ((!trimmed && !hasPasted) || !conversationId || !selectedEventId) {
      return;
    }

    if (sendAbort != null) {
      if (!busySendMode) {
        void vscode.window.showInformationMessage(
          "Colcoor: a reply is still generating. Use “Queue after reply” or “New branch”, or press Stop.",
        );
        return;
      }
      if (!isWaitingForAssistant()) {
        void vscode.window.showWarningMessage(
          "Colcoor: wait until your message appears in the thread, then you can queue or branch.",
        );
        return;
      }
      if (busySendMode === "queue") {
        pendingMainSendQueue.push({ kind: "after_assistant", text: trimmed, images: pastedImages });
      } else {
        pendingMainSendQueue.push({
          kind: "new_branch",
          text: trimmed,
          images: pastedImages,
          privateBranch,
        });
      }
      postState(lastTreeEvents, true, lastPostedError);
      return;
    }

    pendingMainSendQueue = [];
    busyAnchorParentEventId = selectedEventId;

    pendingSendUserMarkdown = trimmed || (hasPasted ? "_Image_…" : "");
    const ws = getWorkspaceRoot();
    sendAbort = new AbortController();
    syncConversationReplyInProgressContext();
    const signal = sendAbort.signal;
    postState(lastTreeEvents, true, lastPostedError);
    const stream = createAssistantStreamPusher(() => panel, () => webviewReady);
    try {
      const refs = await uploadPastedImagesForMainSend(pastedImages);
      if (!trimmed && refs.length === 0) {
        stream.dispose();
        postState(lastTreeEvents, false, lastPostedError);
        return;
      }
      const userMediaContentJson = refs.length > 0 ? buildUserMediaContentJson(refs) : undefined;
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
          ...(lastTreeEvents.length > 0
            ? { prefetchedGraph: { events: lastTreeEvents, notes: lastNotes } }
            : {}),
          ...(userMediaContentJson ? { userMediaContentJson } : {}),
          onUserMessagePersisted: async ({ userEventId }) => {
            pendingSendUserMarkdown = undefined;
            selectedEventId = userEventId;
            await loadTreeAndPush(true, null, {
              skipConversationsList: true,
              skipInlineSideChatRefresh: true,
            });
          },
        },
      );
      stream.dispose();
      if (!result.cancelled) {
        await drainMainSendQueue(result.assistantEventId);
      }
      await loadTreeAndPush(false, null, { finalizeToDefaultBranchTip: true });
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
      pendingSendUserMarkdown = undefined;
      sendAbort = undefined;
      pendingMainSendQueue = [];
      busyAnchorParentEventId = undefined;
      syncConversationReplyInProgressContext();
    }
  }

  async function handleResend(): Promise<void> {
    if (!conversationId || !selectedEventId) {
      return;
    }
    pendingMainSendQueue = [];
    busyAnchorParentEventId = undefined;
    const ws = getWorkspaceRoot();
    sendAbort?.abort();
    sendAbort = new AbortController();
    syncConversationReplyInProgressContext();
    const signal = sendAbort.signal;
    postState(lastTreeEvents, true, lastPostedError);
    const stream = createAssistantStreamPusher(() => panel, () => webviewReady);
    try {
      const result = await runResendAssistant(
        api,
        agent,
        conversationId,
        conversationTitle,
        selectedEventId,
        ws,
        {
          signal,
          onAssistantTextDelta: (t) => stream.pushDelta(t),
          ...(lastTreeEvents.length > 0
            ? { prefetchedGraph: { events: lastTreeEvents, notes: lastNotes } }
            : {}),
        },
      );
      stream.dispose();
      await loadTreeAndPush(false, null, { finalizeToDefaultBranchTip: true });
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

  async function jumpToDefaultBranchTip(opts?: { palette?: boolean }): Promise<void> {
    if (!conversationId) {
      if (opts?.palette) {
        void vscode.window.showWarningMessage(
          "Colcoor: open a conversation (Colcoor: Open conversation) first.",
        );
      }
      return;
    }
    try {
      const prevSel = selectedEventId;
      await loadTreeAndPush(false, null, { finalizeToDefaultBranchTip: true });
      if (selectedEventId) {
        syncActiveToBackend(selectedEventId, {
          needsContextRebuild:
            prevSel !== undefined && prevSel !== selectedEventId,
        });
      }
      if (opts?.palette) {
        void vscode.window.setStatusBarMessage(
          "Colcoor: selection moved to the latest message on the default branch.",
          2500,
        );
      }
    } catch (e) {
      void showColcoorApiFailure(e);
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
      applyConversationMetaFromListRow(out);
      postState(lastTreeEvents, lastPostedBusy, lastPostedError);
    } catch (e) {
      await showColcoorApiFailure(e);
    }
  }

  async function handleTogglePin(): Promise<void> {
    if (!conversationId) {
      return;
    }
    try {
      const out = await api.patchConversation(conversationId, { pinned: !conversationPinned });
      applyConversationMetaFromListRow(out);
      postState(lastTreeEvents, lastPostedBusy, lastPostedError);
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
      syncConversationPanelOpenContext();
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
        const nextId = msg.id.trim();
        if (!nextId) {
          return;
        }
        const prevSel = selectedEventId;
        selectedEventId = nextId;
        // Keep tree selection snappy: render immediately from cached state, then sync active in background.
        if (lastTreeEvents.some((e) => e.id === nextId)) {
          postState(lastTreeEvents, lastPostedBusy, lastPostedError);
        }
        void syncActiveToBackend(nextId, {
          needsContextRebuild: prevSel !== undefined && prevSel !== nextId,
        });
        return;
      }
      if (msg.type === "selectionHistoryBack") {
        if (!visitedSelectionNavFlags().canGoBack || visitedSelectionIndex <= 0) {
          return;
        }
        const nextIdx = visitedSelectionIndex - 1;
        const nextSel = visitedSelectionStack[nextIdx];
        if (!nextSel || !lastTreeEvents.some((e) => e.id === nextSel)) {
          return;
        }
        const prevSel = selectedEventId;
        suppressVisitedSelectionRecording = true;
        try {
          visitedSelectionIndex = nextIdx;
          selectedEventId = nextSel;
          postState(lastTreeEvents, lastPostedBusy, lastPostedError);
          void syncActiveToBackend(nextSel, {
            needsContextRebuild: prevSel !== undefined && prevSel !== nextSel,
          });
        } finally {
          suppressVisitedSelectionRecording = false;
        }
        return;
      }
      if (msg.type === "selectionHistoryForward") {
        if (!visitedSelectionNavFlags().canGoForward) {
          return;
        }
        const nextIdx = visitedSelectionIndex + 1;
        const nextSel = visitedSelectionStack[nextIdx];
        if (!nextSel || !lastTreeEvents.some((e) => e.id === nextSel)) {
          return;
        }
        const prevSel = selectedEventId;
        suppressVisitedSelectionRecording = true;
        try {
          visitedSelectionIndex = nextIdx;
          selectedEventId = nextSel;
          postState(lastTreeEvents, lastPostedBusy, lastPostedError);
          void syncActiveToBackend(nextSel, {
            needsContextRebuild: prevSel !== undefined && prevSel !== nextSel,
          });
        } finally {
          suppressVisitedSelectionRecording = false;
        }
        return;
      }
      if (msg.type === "treeContextMenu" && typeof msg.id === "string") {
        if (!conversationId) {
          return;
        }
        const targetId = msg.id.trim();
        if (!targetId) {
          return;
        }
        if (selectedEventId !== targetId) {
          const prevSel = selectedEventId;
          selectedEventId = targetId;
          if (lastTreeEvents.some((e) => e.id === targetId)) {
            postState(lastTreeEvents, lastPostedBusy, lastPostedError);
          }
          void syncActiveToBackend(targetId, {
            needsContextRebuild: prevSel !== undefined && prevSel !== targetId,
          });
        }
        type TreeCtxPick = vscode.QuickPickItem & { commandId: string };
        const picks: TreeCtxPick[] = TREE_NODE_CONTEXT_MENU_ENTRIES.map((e) => ({
          label: e.quickPickLabel,
          description: e.quickPickDescription,
          commandId: e.commandId,
        }));
        const picked = await vscode.window.showQuickPick(picks, { title: "Colcoor: tree node actions" });
        if (picked?.commandId) {
          await vscode.commands.executeCommand(picked.commandId);
        }
        return;
      }
      if (msg.type === "selectTip") {
        await jumpToDefaultBranchTip();
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
        if (msg.text.trim().length > 0) {
          void vscode.window.setStatusBarMessage("Colcoor: message copied to clipboard.", 2500);
        }
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
        if (typeof msg.sideChatColumnWidthPx === "number") {
          const sw = Math.floor(msg.sideChatColumnWidthPx);
          if (sw >= 160 && sw < 8000) {
            void context.workspaceState.update(SIDE_CHAT_COLUMN_WIDTH_STATE_KEY, sw);
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
      if (msg.type === "referenceInSideChat") {
        if (!conversationId || !selectedEventId) {
          return;
        }
        const exists = lastTreeEvents.some((e) => e.id === selectedEventId);
        if (!exists) {
          void vscode.window.showWarningMessage(
            `Colcoor: selection is not in the loaded tree — try ${COLOOR_REFRESH_CONVERSATION_TREE_PANEL_BUTTON_LABEL}.`,
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
            `Colcoor: selection is not in the loaded tree — try ${COLOOR_REFRESH_CONVERSATION_TREE_PANEL_BUTTON_LABEL}.`,
          );
          return;
        }
        await vscode.commands.executeCommand("colcoor.referenceSelectedNoteInSideChat");
        return;
      }
      if (msg.type === "searchHit") {
        if (!conversationId || !panel) {
          return;
        }
        const t = msg.target;
        if (t.kind === "tree") {
          const id = typeof t.eventId === "string" ? t.eventId.trim() : "";
          if (!id || !lastTreeEvents.some((e) => e.id === id)) {
            void vscode.window.showWarningMessage(
              `Colcoor: that message is not in the loaded tree — try ${COLOOR_REFRESH_CONVERSATION_TREE_PANEL_BUTTON_LABEL}.`,
            );
            return;
          }
          const prevSel = selectedEventId;
          selectedEventId = id;
          if (lastTreeEvents.some((e) => e.id === id)) {
            postState(lastTreeEvents, lastPostedBusy, lastPostedError);
          }
          void syncActiveToBackend(id, {
            needsContextRebuild: prevSel !== undefined && prevSel !== id,
          });
          return;
        }
        if (t.kind === "note") {
          const eid = typeof t.eventId === "string" ? t.eventId.trim() : "";
          if (!eid || !lastTreeEvents.some((e) => e.id === eid)) {
            void vscode.window.showWarningMessage(
              `Colcoor: that note’s message is not in the loaded tree — try ${COLOOR_REFRESH_CONVERSATION_TREE_PANEL_BUTTON_LABEL}.`,
            );
            return;
          }
          const prevSel = selectedEventId;
          selectedEventId = eid;
          if (lastTreeEvents.some((e) => e.id === eid)) {
            postState(lastTreeEvents, lastPostedBusy, lastPostedError);
          }
          void syncActiveToBackend(eid, {
            needsContextRebuild: prevSel !== undefined && prevSel !== eid,
          });
          await showNotesOnSelectedMessage();
          return;
        }
        if (t.kind === "sidechat") {
          const seq = typeof t.seq === "number" && Number.isFinite(t.seq) ? Math.floor(t.seq) : 0;
          if (seq <= 0) {
            return;
          }
          if (conversationId) {
            dismissedInlineSideChatByConversationId.delete(conversationId);
          }
          inlineSideChatVisible = true;
          try {
            await refreshInlineSideChat();
          } catch (e) {
            if (isPlanLimitColcoorApiError(e)) {
              void showColcoorApiFailure(e);
            }
          }
          postState(lastTreeEvents, lastPostedBusy, lastPostedError);
          try {
            await panel.webview.postMessage({ type: "focusSideChatSeq", seq });
          } catch {
            /* webview gone */
          }
          return;
        }
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
        if (conversationId) {
          dismissedInlineSideChatByConversationId.delete(conversationId);
        }
        inlineSideChatVisible = true;
        try {
          await refreshConversationMeta();
          await refreshInlineSideChat();
          await markInlineSideChatReadFromCache(true);
        } catch (e) {
          if (isPlanLimitColcoorApiError(e)) {
            void showColcoorApiFailure(e);
          }
        }
        postState(lastTreeEvents, sendAbort != null, null);
        return;
      }
      if (msg.type === "closeSideChat") {
        await markInlineSideChatReadFromCache(false);
        inlineSideChatVisible = false;
        if (conversationId) {
          dismissedInlineSideChatByConversationId.add(conversationId);
        }
        postState(lastTreeEvents, sendAbort != null, null);
        return;
      }
      if (msg.type === "refreshSideChat") {
        if (!conversationId) {
          return;
        }
        try {
          await refreshInlineSideChat();
          await markInlineSideChatReadFromCache(true);
        } catch (e) {
          if (isPlanLimitColcoorApiError(e)) {
            void showColcoorApiFailure(e);
          }
        }
        postState(lastTreeEvents, sendAbort != null, null);
        return;
      }
      if (msg.type === "sendSideChat") {
        if (!conversationId) {
          return;
        }
        const refs: ColcoorUserMediaImageRef[] = [];
        const pastedDataUrlsForOptimistic: string[] = [];
        for (const row of msg.images ?? []) {
          const parsed = parseDataUrlToBytes(typeof row?.dataUrl === "string" ? row.dataUrl : "");
          if (!parsed) {
            continue;
          }
          try {
            const up = await api.uploadConversationImage(conversationId, parsed.bytes, parsed.mimeType);
            refs.push({ id: up.id, mime_type: up.mime_type, byte_size: up.byte_size });
            pastedDataUrlsForOptimistic.push(
              typeof row?.dataUrl === "string" ? row.dataUrl : "",
            );
          } catch (e) {
            await showColcoorApiFailure(e);
            return;
          }
        }
        const contentJson = refs.length > 0 ? buildUserMediaContentJson(refs) : undefined;
        const refSc = normalizeSideChatReferenceId(
          typeof msg.referencedSideChatMessageId === "string" ? msg.referencedSideChatMessageId : undefined,
        );
        const payload = buildSideChatSendPayload(
          msg.text,
          refSc,
          null,
          null,
          inlineSideChatRows,
          contentJson,
        );
        if (!payload) {
          void vscode.window.showWarningMessage("Colcoor: side chat message is empty.");
          return;
        }
        const me = await ensureMeForSideChat();
        const tempId = newOptimisticSideChatMessageId();
        const jobConversationId = conversationId;
        const provisionalSeq = maxSideChatSeq(inlineSideChatRows) + 1;
        const optimistic = buildOptimisticSideChatUserMessage({
          conversationId: jobConversationId,
          tempId,
          seq: provisionalSeq,
          me,
          body: payload.body ?? "",
          contentJson: payload.content_json ?? null,
          referencedEventId: payload.referenced_event_id ?? null,
          referencedNoteId: payload.referenced_note_id ?? null,
          referencedSideChatMessageId: payload.referenced_side_chat_message_id ?? null,
        });
        inlineSideChatRows = mergeSideChatMessage(inlineSideChatRows, optimistic);
        if (pastedDataUrlsForOptimistic.length > 0) {
          inlineSideChatUrlsByMessageId.set(tempId, [...pastedDataUrlsForOptimistic]);
        } else {
          inlineSideChatUrlsByMessageId.delete(tempId);
        }
        rebuildInlineSideChatRendered();
        postState(lastTreeEvents, sendAbort != null, null);

        inlineSideChatPostChain = inlineSideChatPostChain
          .catch(() => {
            /* keep the queue alive if a prior chained step rejected */
          })
          .then(() =>
            postOneInlineSideChatJob({
              conversationId: jobConversationId,
              tempId,
              payload,
            }),
          );
        return;
      }
      if (msg.type === "editSideChat") {
        if (!conversationId) {
          return;
        }
        const mid = normalizeSideChatReferenceId(
          typeof msg.messageId === "string" ? msg.messageId : undefined,
        );
        if (!mid) {
          return;
        }
        const uid =
          viewerUserIdForWebview ??
          (typeof myProfileForSideChat?.id === "string" ? myProfileForSideChat.id : null);
        const row = inlineSideChatRows.find((m) => m.id === mid);
        if (!row || !canMutateOwnSideChatUserMessage(row, uid)) {
          void vscode.window.showWarningMessage("Colcoor: you can only edit your own side-chat messages.");
          return;
        }
        const body = trimmedSideChatSendBody(msg.text);
        if (!body) {
          void vscode.window.showWarningMessage("Colcoor: side chat message is empty.");
          return;
        }
        try {
          const updated = await api.patchSideChatMessage(conversationId, mid, { body });
          inlineSideChatRows = mergeSideChatMessage(inlineSideChatRows, updated);
          rebuildInlineSideChatRendered();
          postState(lastTreeEvents, sendAbort != null, null);
        } catch (e) {
          await showColcoorApiFailure(e);
        }
        return;
      }
      if (msg.type === "deleteSideChat") {
        if (!conversationId) {
          return;
        }
        const mid = normalizeSideChatReferenceId(
          typeof msg.messageId === "string" ? msg.messageId : undefined,
        );
        if (!mid) {
          return;
        }
        const uid =
          viewerUserIdForWebview ??
          (typeof myProfileForSideChat?.id === "string" ? myProfileForSideChat.id : null);
        const row = inlineSideChatRows.find((m) => m.id === mid);
        if (!row || !canDeleteSideChatMessage(row, uid, viewerConversationRole)) {
          void vscode.window.showWarningMessage("Colcoor: you cannot delete this side-chat message.");
          return;
        }
        const isOwnerModeration =
          viewerConversationRole === "owner" &&
          uid != null &&
          (row.kind !== "user" || row.author_user_id !== uid);
        const choice = await vscode.window.showWarningMessage(
          isOwnerModeration
            ? "Delete this side-chat message as conversation owner?"
            : "Delete this side-chat message?",
          { modal: true, detail: mid ?? "" },
          "Delete",
        );
        if (choice !== "Delete") {
          return;
        }
        try {
          const tombstone = await api.deleteSideChatMessage(conversationId, mid);
          inlineSideChatRows = mergeSideChatMessage(inlineSideChatRows, tombstone);
          inlineSideChatUrlsByMessageId.delete(tombstone.id);
          rebuildInlineSideChatRendered();
          postState(lastTreeEvents, sendAbort != null, null);
          await refreshConversationMeta();
        } catch (e) {
          await showColcoorApiFailure(e);
        }
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
      if (msg.type === "openColcoorHub") {
        await vscode.commands.executeCommand("colcoor.showColcoorMenu");
        return;
      }
      if (msg.type === "openHelp") {
        await vscode.commands.executeCommand("colcoor.openAbout");
        return;
      }
      if (msg.type === "executeColcoorCommand" && typeof msg.command === "string") {
        if (WEBVIEW_ACCOUNT_COMMAND_ALLOWLIST.has(msg.command)) {
          await vscode.commands.executeCommand(msg.command);
        }
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
      if (msg.type === "toggleStar") {
        await toggleStarSelectedMessage();
        return;
      }
      if (msg.type === "addNote") {
        await addNoteToSelectedMessage();
        return;
      }
      if (msg.type === "listNotesOnSelection") {
        await showNotesOnSelectedMessage();
        return;
      }
      if (msg.type === "deleteMessageBranch") {
        await deleteSelectedMessageSubtree();
        return;
      }
      if (msg.type === "editMessageTitle") {
        if (!conversationId || !selectedEventId) {
          void vscode.window.showWarningMessage(
            "Colcoor: open a conversation and select a message in the tree.",
          );
          return;
        }
        const exists = lastTreeEvents.some((e) => e.id === selectedEventId);
        if (!exists) {
          void vscode.window.showWarningMessage(
            `Colcoor: selection is not in the loaded tree — try ${COLOOR_REFRESH_CONVERSATION_TREE_PANEL_BUTTON_LABEL}.`,
          );
          return;
        }
        const ev = lastTreeEvents.find((e) => e.id === selectedEventId);
        const current = ev ? trimmedGraphCheckpointLabel(ev) ?? "" : "";
        const next = await vscode.window.showInputBox({
          title: "Colcoor — message title",
          value: current,
          prompt:
            "Optional title for this message (display-only). Leave empty to clear. Max 256 characters.",
          ignoreFocusOut: true,
          validateInput: (v) => {
            const t = normalizePersistedUserInputText(v ?? "");
            if (t.length > 256) {
              return "Title must be at most 256 characters.";
            }
            return undefined;
          },
        });
        if (next === undefined) {
          return;
        }
        const trimmed = normalizePersistedUserInputText(next);
        const payload = trimmed.length > 0 ? trimmed.slice(0, 256) : null;
        try {
          await api.patchEventCheckpointLabel(conversationId, selectedEventId, payload);
          void vscode.window.setStatusBarMessage(
            payload ? "Colcoor: title saved." : "Colcoor: title cleared.",
            2500,
          );
          await loadTreeAndPush(false, null, { skipConversationsList: true });
        } catch (e) {
          void showColcoorApiFailure(e);
        }
        return;
      }
      if (msg.type === "send" && typeof msg.text === "string") {
        await handleSend(msg.text, Boolean(msg.privateBranch), msg.images, msg.busySendMode);
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
          await mergeNotesIntoCachedTreeAndPost();
        } catch (e) {
          void showColcoorApiFailure(e);
        }
        return;
      }
      if (msg.type === "editNote" && typeof msg.noteId === "string" && conversationId) {
        try {
          let row = lastNotes.find((n) => n.id === msg.noteId);
          if (!row) {
            const all = await api.listNotes(conversationId);
            row = all.find((n) => n.id === msg.noteId);
          }
          if (!row) {
            void vscode.window.showWarningMessage(
              `Colcoor: note not found — try ${COLOOR_REFRESH_CONVERSATION_TREE_PANEL_BUTTON_LABEL}.`,
            );
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
          const updated = await api.patchNote(conversationId, msg.noteId, { content: trimmed });
          void vscode.window.setStatusBarMessage("Colcoor: note updated.", 2000);
          if (lastNotes.some((n) => n.id === updated.id)) {
            lastNotes = lastNotes.map((n) => (n.id === updated.id ? updated : n));
          } else {
            lastNotes = [...lastNotes, updated];
          }
          postState(lastTreeEvents, lastPostedBusy, lastPostedError);
        } catch (e) {
          void showColcoorApiFailure(e);
        }
        return;
      }
    });

    p.onDidDispose(() => {
      stopInlineSideChatSse();
      inlineSideChatNotifiedMessageIds.clear();
      inlineSideChatLastNotificationAtMs = null;
      if (inlineSideChatListRefreshTimer !== undefined) {
        clearTimeout(inlineSideChatListRefreshTimer);
        inlineSideChatListRefreshTimer = undefined;
      }
      sendAbort?.abort();
      sendAbort = undefined;
      syncConversationReplyInProgressContext();
      panel = undefined;
      webviewReady = false;
      conversationId = undefined;
      resetVisitedSelectionHistory();
      selectedEventId = undefined;
      conversationPinned = false;
      lastTreeEvents = [];
      lastConversationMembers = [];
      lastNotes = [];
      lastNeedsContextRebuild = false;
      lastSideChatReadSeq = 0;
      viewerUserIdForWebview = null;
      viewerConversationRole = null;
      inlineSideChatVisible = false;
      inlineSideChatRows = [];
      inlineSideChatUrlsByMessageId = new Map();
      inlineSideChatRendered = [];
      inlineSideChatPostChain = Promise.resolve();
      syncConversationPanelOpenContext();
    });

    panel = p;
    syncConversationPanelOpenContext();
    return p;
  }

  async function toggleStarSelectedMessage(): Promise<void> {
    if (!conversationId || !selectedEventId) {
      void vscode.window.showWarningMessage("Colcoor: open a conversation and select a message in the tree.");
      return;
    }
    const ev = lastTreeEvents.find((e) => e.id === selectedEventId);
    if (!ev) {
      void vscode.window.showWarningMessage(
        `Colcoor: selection not in the loaded tree — try ${COLOOR_REFRESH_CONVERSATION_TREE_PANEL_BUTTON_LABEL}.`,
      );
      return;
    }
    try {
      const nextStarred = ev.starred === true ? false : true;
      if (ev.starred === true) {
        await api.deleteStar(conversationId, selectedEventId);
        void vscode.window.setStatusBarMessage("Colcoor: star removed.", 2000);
      } else {
        await api.putStar(conversationId, selectedEventId);
        void vscode.window.setStatusBarMessage("Colcoor: message starred.", 2000);
      }
      lastTreeEvents = lastTreeEvents.map((e) =>
        e.id === selectedEventId ? { ...e, starred: nextStarred } : e,
      );
      postState(lastTreeEvents, lastPostedBusy, lastPostedError);
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
      void vscode.window.showWarningMessage(
        `Colcoor: selection not in the loaded tree — try ${COLOOR_REFRESH_CONVERSATION_TREE_PANEL_BUTTON_LABEL}.`,
      );
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
      const created = await api.createNote(conversationId, { event_id: selectedEventId, content: noteContent });
      void vscode.window.setStatusBarMessage("Colcoor: note added.", 2500);
      lastNotes = [...lastNotes, created];
      const counts = noteCountsByEventId(lastNotes);
      lastTreeEvents = lastTreeEvents.map((e) => ({
        ...e,
        note_count: counts.get(e.id) ?? 0,
      }));
      postState(lastTreeEvents, lastPostedBusy, lastPostedError);
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
      const all =
        lastTreeEvents.length > 0 ? lastNotes : await api.listNotes(conversationId);
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

  async function deleteSelectedMessageSubtree(): Promise<void> {
    if (!conversationId || !selectedEventId) {
      void vscode.window.showWarningMessage("Colcoor: open a conversation and select a message in the tree.");
      return;
    }
    if (!lastTreeEvents.some((e) => e.id === selectedEventId)) {
      void vscode.window.showWarningMessage(
        `Colcoor: selection not in the loaded tree — try ${COLOOR_REFRESH_CONVERSATION_TREE_PANEL_BUTTON_LABEL}.`,
      );
      return;
    }
    const rootEv = lastTreeEvents.find((e) => e.parent_event_id === null);
    if (rootEv && selectedEventId === rootEv.id) {
      void vscode.window.showWarningMessage("Colcoor: the conversation root cannot be deleted.");
      return;
    }
    if (viewerConversationRole === "viewer") {
      void vscode.window.showWarningMessage("Colcoor: viewers cannot delete a message branch.");
      return;
    }
    const choice = await vscode.window.showWarningMessage(
      "Colcoor: delete this message and every reply under it on this branch?",
      { modal: true },
      "Delete branch",
    );
    if (choice !== "Delete branch") {
      return;
    }
    const subtreeSize = countSubtreeNodes(lastTreeEvents, selectedEventId);
    if (subtreeSize > SUBTREE_TYPED_DELETE_THRESHOLD) {
      const typedOk = await confirmDestructiveActionByTypingDelete({
        title: "Colcoor — confirm branch delete",
        prompt: `This branch includes ${subtreeSize} message(s). Type DELETE to confirm.`,
      });
      if (!typedOk) {
        return;
      }
    }
    try {
      const out = await api.deleteEventSubtree(conversationId, selectedEventId);
      void vscode.window.setStatusBarMessage("Colcoor: message branch deleted.", 2500);
      await loadTreeAndPush(false, null, { skipConversationsList: true });
      if (out.deleted_count > 0 && out.deletion_group_id) {
        const undoPick = await vscode.window.showInformationMessage(
          "Colcoor: message branch deleted.",
          "Undo",
        );
        if (undoPick === "Undo") {
          try {
            await api.undoEventDeletion(conversationId, out.deletion_group_id);
            void vscode.window.setStatusBarMessage("Colcoor: deletion undone.", 2500);
            await loadTreeAndPush(false, null, { skipConversationsList: true });
          } catch (undoErr) {
            void showColcoorApiFailure(undoErr);
          }
        }
      }
    } catch (e) {
      void showColcoorApiFailure(e);
    }
  }

  async function restoreMessageBranchFromPalette(): Promise<void> {
    const cid = conversationId;
    if (!cid) {
      void vscode.window.showWarningMessage(
        "Colcoor: open a conversation in the conversation panel first.",
      );
      return;
    }
    if (viewerConversationRole === "viewer") {
      void vscode.window.showWarningMessage("Colcoor: viewers cannot restore a message branch.");
      return;
    }
    const raw = await vscode.window.showInputBox({
      title: "Colcoor — restore message branch",
      prompt: "Paste the event id (UUID) of any message in the soft-deleted branch.",
      ignoreFocusOut: true,
    });
    if (raw === undefined) {
      return;
    }
    const eid = normalizeOptionalGraphEventId(raw.trim());
    if (eid === undefined) {
      void vscode.window.showWarningMessage("Colcoor: that is not a valid event id.");
      return;
    }
    try {
      const r = await api.restoreEventSubtree(cid, eid);
      void vscode.window.setStatusBarMessage(
        `Colcoor: restored ${r.restored_count} message(s).`,
        3500,
      );
      await loadTreeAndPush(false, null, { skipConversationsList: true });
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
      const sameConversationAlreadyLoaded =
        panel != null &&
        webviewReady &&
        conversationId === cid &&
        lastTreeEvents.length > 0;
      if (sameConversationAlreadyLoaded) {
        conversationTitle = title;
        const p = ensurePanel();
        p.title = `Colcoor — ${title?.trim() ? title : "(untitled)"}`;
        postState(lastTreeEvents, lastPostedBusy, lastPostedError);
        p.reveal(vscode.ViewColumn.One, false);
        return;
      }
      if (conversationId !== cid) {
        stopInlineSideChatSse();
        inlineSideChatNotifiedMessageIds.clear();
        inlineSideChatLastNotificationAtMs = null;
        sendAbort?.abort();
        sendAbort = undefined;
        pendingMainSendQueue = [];
        busyAnchorParentEventId = undefined;
        pendingSendUserMarkdown = undefined;
        syncConversationReplyInProgressContext();
      }
      conversationId = cid;
      conversationTitle = title;
      conversationPinned = false;
      staleTreePromptedForEventId = null;
      staleTreePromptedForGrowthFingerprint = null;
      viewerUserIdMemo = undefined;
      resetVisitedSelectionHistory();
      selectedEventId = undefined;
      lastNotes = [];
      lastNeedsContextRebuild = false;
      lastTreeEvents = [];
      lastConversationMembers = [];
      sideChatUnreadCount = 0;
      sideChatHasUnread = false;
      lastSideChatReadSeq = 0;
      viewerUserIdForWebview = null;
      inlineSideChatVisible = false;
      inlineSideChatRows = [];
      inlineSideChatUrlsByMessageId = new Map();
      inlineSideChatRendered = [];
      inlineSideChatPostChain = Promise.resolve();
      const p = ensurePanel();
      p.title = `Colcoor — ${title?.trim() ? title : "(untitled)"}`;
      if (webviewReady) {
        await loadTreeAndPush(false, null);
      }
      p.reveal(vscode.ViewColumn.One, false);
    },
    async revealAtEvent(
      convId: string,
      title: string | null,
      eventId: string,
      prefetch?: RevealAtEventPrefetchOptions,
    ): Promise<void> {
      const cid = normalizeOptionalGraphEventId(convId);
      const eid = normalizeOptionalGraphEventId(eventId);
      if (cid === undefined || eid === undefined) {
        return;
      }
      if (conversationId !== cid) {
        stopInlineSideChatSse();
        inlineSideChatNotifiedMessageIds.clear();
        inlineSideChatLastNotificationAtMs = null;
        sendAbort?.abort();
        sendAbort = undefined;
        pendingMainSendQueue = [];
        busyAnchorParentEventId = undefined;
        pendingSendUserMarkdown = undefined;
        syncConversationReplyInProgressContext();
      }
      conversationId = cid;
      conversationTitle = title;
      conversationPinned = false;
      staleTreePromptedForEventId = null;
      staleTreePromptedForGrowthFingerprint = null;
      viewerUserIdMemo = undefined;
      resetVisitedSelectionHistory();
      lastNotes = [];
      lastNeedsContextRebuild = false;
      lastTreeEvents = [];
      lastConversationMembers = [];
      sideChatUnreadCount = 0;
      sideChatHasUnread = false;
      lastSideChatReadSeq = 0;
      viewerUserIdForWebview = null;
      inlineSideChatVisible = false;
      inlineSideChatRows = [];
      inlineSideChatUrlsByMessageId = new Map();
      inlineSideChatRendered = [];
      inlineSideChatPostChain = Promise.resolve();
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
        await loadTreeAndPush(false, null, {
          prefetchedTreeEvents: prefetch?.prefetchedTreeEvents,
          prefetchedNotes: prefetch?.prefetchedNotes,
        });
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
    deleteSelectedMessageSubtree,
    getLoadedConversationId: () => conversationId,
    restoreMessageBranchFromPalette,
    getSelectedMessageContext: () => {
      if (!conversationId || !selectedEventId) {
        return null;
      }
      return {
        conversationId,
        selectedEventId,
        title: conversationTitle ?? null,
        ...(lastTreeEvents.length > 0 ? { cachedNotesForConversation: lastNotes } : {}),
      };
    },
    cancelInFlightGeneration: () => {
      sendAbort?.abort();
    },
    async continueFromHere(): Promise<void> {
      const gate = evaluateContinueFromHere(
        conversationId,
        selectedEventId,
        lastTreeEvents.map((e) => e.id),
      );
      if (gate === "no_context") {
        void vscode.window.showWarningMessage(
          "Colcoor: open a conversation and select a message in the tree.",
        );
        return;
      }
      if (gate === "not_in_tree") {
        void vscode.window.showWarningMessage(
          `Colcoor: selection is not in the loaded tree — try ${COLOOR_REFRESH_CONVERSATION_TREE_PANEL_BUTTON_LABEL}.`,
        );
        return;
      }
      if (selectedEventId) {
        syncActiveToBackend(selectedEventId, { needsContextRebuild: false });
        void vscode.window.setStatusBarMessage("Colcoor: continuing from selected message.", 2200);
      }
    },
    async resendAssistant(): Promise<void> {
      const gate = evaluateResendAssistantGate(conversationId, selectedEventId, lastTreeEvents);
      if (gate === "no_context") {
        void vscode.window.showWarningMessage(
          "Colcoor: open a conversation and select a user message in the tree.",
        );
        return;
      }
      if (gate === "not_in_tree") {
        void vscode.window.showWarningMessage(
          `Colcoor: selection is not in the loaded tree — try ${COLOOR_REFRESH_CONVERSATION_TREE_PANEL_BUTTON_LABEL}.`,
        );
        return;
      }
      if (gate === "not_user_message") {
        void vscode.window.showWarningMessage(
          'Colcoor: resend only applies to a user message — select a "User" row in the tree.',
        );
        return;
      }
      if (gate === "empty_user_body") {
        void vscode.window.showWarningMessage(
          "Colcoor: that user message is empty — pick a user message with text (not the empty root placeholder).",
        );
        return;
      }
      await handleResend();
    },
    async jumpToLatestInConversation(): Promise<void> {
      await jumpToDefaultBranchTip({ palette: true });
    },
    async copySelectedMessage(): Promise<void> {
      const gate = evaluateContinueFromHere(
        conversationId,
        selectedEventId,
        lastTreeEvents.map((e) => e.id),
      );
      if (gate === "no_context") {
        void vscode.window.showWarningMessage(
          "Colcoor: open a conversation and select a message in the tree.",
        );
        return;
      }
      if (gate === "not_in_tree") {
        void vscode.window.showWarningMessage(
          `Colcoor: selection is not in the loaded tree — try ${COLOOR_REFRESH_CONVERSATION_TREE_PANEL_BUTTON_LABEL}.`,
        );
        return;
      }
      if (!selectedEventId) {
        return;
      }
      const text = clipboardTextForSelectedTreeMessage(lastTreeEvents, selectedEventId);
      if (text === undefined) {
        void vscode.window.showWarningMessage(
          `Colcoor: selection is not in the loaded tree — try ${COLOOR_REFRESH_CONVERSATION_TREE_PANEL_BUTTON_LABEL}.`,
        );
        return;
      }
      if (text.trim().length === 0) {
        void vscode.window.showInformationMessage("Colcoor: the selected message has no text to copy.");
        return;
      }
      await vscode.env.clipboard.writeText(text);
      void vscode.window.setStatusBarMessage("Colcoor: message copied to clipboard.", 2500);
    },
    async refreshConversationTree(opts?: { quiet?: boolean }): Promise<void> {
      if (!conversationId) {
        void vscode.window.showWarningMessage(
          "Colcoor: open a conversation (Colcoor: Open conversation) first.",
        );
        return;
      }
      if (!panel) {
        void vscode.window.showWarningMessage(
          "Colcoor: open the conversation panel, then run this command again.",
        );
        return;
      }
      await loadTreeAndPush(false, null);
      if (!opts?.quiet) {
        void vscode.window.setStatusBarMessage("Colcoor: conversation tree refreshed.", 2500);
      }
    },
    async openInlineSideChat(): Promise<void> {
      if (conversationId) {
        dismissedInlineSideChatByConversationId.delete(conversationId);
      }
      inlineSideChatVisible = true;
      try {
        await refreshConversationMeta();
        await refreshInlineSideChat();
        await markInlineSideChatReadFromCache(true);
      } catch (e) {
        if (isPlanLimitColcoorApiError(e)) {
          void showColcoorApiFailure(e);
        }
      }
      postState(lastTreeEvents, Boolean(sendAbort), null);
    },
    dispose: () => {
      subscription.dispose();
      colcoorNotesChannel.dispose();
      disposePanel();
    },
  };
}
