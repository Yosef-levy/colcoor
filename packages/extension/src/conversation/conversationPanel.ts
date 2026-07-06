import * as vscode from "vscode";
import type { AgentRunner } from "../agent/agentRunner";
import type { CursorCliMode } from "../agent/cursorCliMode";
import {
  getAgentModelCatalog,
  scheduleRefreshAgentModelCatalog,
} from "../agent/agentModelCatalogCache";
import type { CursorAgentModelEntry } from "../agent/cursorAgentModelCatalog";
import type {
  ColcoorClient,
  ConversationListItemOut,
  ConversationListOut,
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
import { getColcoorOutputLog } from "../util/colcoorOutputLog";
import { reportPanelApiError } from "../util/reportPanelApiError";
import { createAssistantStreamPusher } from "./assistantStreamWebview";
import {
  COLCOOR_CONVERSATION_PANEL_OPEN_CONTEXT,
  COLCOOR_CONVERSATION_REPLY_IN_PROGRESS_CONTEXT,
} from "./colcoorContextKeys";
import { isSafeHttpUrlForWebview, listLegalPolicyLinksFromColcoorWorkspaceSection } from "./legalPolicySection";
import { getConversationWebviewHtml } from "./conversationWebviewHtml";
import {
  armTryThisNextForConversation as persistTryThisNextConversation,
  dismissOnboarding,
  dismissSoloCollaboratorHint,
  dismissTryThisNext,
  isGettingStartedVisibleSync,
  isSoloCollaboratorHintDismissedSync,
  isTryThisNextVisibleSync,
} from "../onboarding/gettingStarted";
import { buildConversationDrawersModel, type TodoDrawerRow, type StarredDrawerRow } from "./drawersModel";
import { runResendAssistant } from "./resendAssistant";
import {
  normalizeOptionalGraphEventId,
  normalizePersistedUserInputText,
} from "./normalizeUserInputText";
import { buildUserImageDataUrlsByEventId } from "./conversationImageDataUrls";
import { runColcoorUserTurn } from "./runUserTurn";
import { shouldAutoSelectPersistedUserMessage } from "./persistedUserSelection";
import { enrichGraphEventsWithComposerDisplay } from "./enrichGraphEventsWithComposerDisplay";
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
import {
  AGENT_MODEL_AUTO,
  agentModelCliFlag,
  readAgentModelByConversationMap,
  readSelectedAgentModelForConversation,
  writeSelectedAgentModelForConversation,
} from "./conversationAgentModel";
import {
  readAgentModeByConversationMap,
  readSelectedAgentModeForConversation,
  writeSelectedAgentModeForConversation,
} from "./conversationAgentMode";
import { resolveAgentModelShortLabel } from "./agentModelDisplay";
import { evaluateContinueFromHere } from "./continueFromHereGate";
import { clipboardTextForTreeMessage } from "./selectedMessageClipboardText";
import { evaluateResendAssistantGate } from "./resendAssistantGate";
import { evaluateEditUserMessageGate } from "./editUserMessageGate";
import { buildComposerPrefillFromUserEvent, type ComposerPrefillPayload } from "./buildComposerPrefillFromUserEvent";
import { mergeUserMediaImageRefs } from "./mergeUserMediaImageRefs";
import {
  currentLinearContextTokens,
  estimateLinearMessageTokens,
  estimateLinearNoteTokens,
  mergeConversationContextSavingsMetadata,
  mergeConversationLinearContextTokenIncrement,
  readConversationContextSavingsAggregate,
  type ContextSavingsTurn,
} from "./contextSavings";
import {
  findBranchTipOrUndeletedAncestor,
  lowestUndeletedAncestorId,
  mergeEventLineageById,
  trimmedGraphCheckpointLabel,
} from "./treeEvents";
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
import { maxSideChatSeq, maxStableSideChatSeq } from "../sidechat/sideChatReadCursor";
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
  {
    kind: "after_assistant";
    text: string;
    images?: { dataUrl: string }[];
    imageRefs?: ColcoorUserMediaImageRef[];
    privateBranch: boolean;
    cliModel?: string;
    cliMode: CursorCliMode;
  };

type ActiveMainRun = {
  runId: string;
  anchorParentEventId: string;
  userEventId?: string;
  assistantEventId?: string;
  pendingUserMarkdown?: string;
  queue: QueuedMainSendItem[];
  abort: AbortController;
  streamHtml: string | null;
  streamDisplayParts: unknown[];
  modelLabel: string | null;
  privateBranch: boolean;
  createdAt: number;
};

type SelectedMainRunState = {
  runId: string;
  anchorParentEventId: string;
  userEventId: string | null;
  queueCount: number;
  waitingForAssistant: boolean;
  modelLabel: string | null;
};

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
  contextSavings: {
    tokensSaved: number;
    percentSaved: number;
    totalLinearContextTokens: number;
    countedGenerations: number;
  } | null;
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
  /** Active run for the currently selected tree message, if any. */
  selectedRun: SelectedMainRunState | null;
  /** Current stream HTML for selectedRun, restored on branch switches. */
  selectedRunStreamingHtml: string | null;
  selectedRunStreamingDisplayParts: unknown[];
  activeRunCount: number;
  /** Inline side-chat drawer in the same conversation tab. */
  sideChatVisible: boolean;
  /** SSE connection banner in the side-chat column (`reconnecting` | `restored` | hidden). */
  sideChatSseStatus?: "reconnecting" | "restored" | null;
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
  /** User-created Lists and selected-text items for the Collections drawer and thread highlights. */
  drawersLists: ConversationListOut[];
  drawersListItems: ConversationListItemOut[];
  /** Client-only visited selection stack (max ~20); thread ← / → controls. */
  selectionVisitCanGoBack: boolean;
  selectionVisitCanGoForward: boolean;
  /** True after the selected run user line is persisted and until that assistant run finishes ([ui-features.md] §7). */
  waitingForAssistant: boolean;
  /** Messages staged for the selected run while {@link waitingForAssistant}. */
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
  /** Side-chat sound preview/playback volume as linear gain (0..1). */
  sideChatSoundVolume: number;
  /** One-line summary for staged main-thread reference on next side-chat send, or null. */
  pendingSideChatGraphReferenceSummary: string | null;
  /** One-shot composer fill after “Edit message” (consumed on next state post). */
  composerPrefill?: ComposerPrefillPayload | null;
  /** Curated Cursor CLI models for the composer dropdown (`id` + display `label`). */
  agentModelOptions: CursorAgentModelEntry[];
  /** `auto` or a model id from {@link agentModelOptions} / full picker. */
  agentModelSelected: string;
  /** Shown as the model dropdown title when the CLI list is empty or failed. */
  agentModelsListHint: string | null;
  /** Cursor CLI mode for sends in this conversation. */
  agentModeSelected: CursorCliMode;
  /** Short label for the in-flight assistant reply (tree/thread headers while busy). */
  pendingAssistantModelLabel: string | null;
  /** When true, re-render the thread without scrolling to the bottom (note add/edit/delete). */
  preserveThreadScroll?: boolean;
  /** Inline getting-started banner (first-run). */
  gettingStartedVisible?: boolean;
  /** Dismissible suggestions after creating a conversation. */
  tryThisNextVisible?: boolean;
  /** Per-conversation dismissal for the solo collaborator invite hint. */
  soloCollaboratorHintDismissed?: boolean;
  /** Collaborators for roster / solo-invite hint. */
  conversationMembers?: {
    user_id: string;
    role: string;
    display_name?: string | null;
    email?: string | null;
    handle?: string | null;
  }[];
};

type FromWebview =
  | { type: "ready" }
  | { type: "audioUnlocked" }
  | {
      type: "send";
      text: string;
      privateBranch?: boolean;
      /** Pasted images as data URLs (image/* only); host uploads then appends colcoor_user_media. */
      images?: { dataUrl: string }[];
      /** Existing conversation image refs (e.g. from “Edit message”); not re-uploaded. */
      imageRefs?: ColcoorUserMediaImageRef[];
      /**
       * When a main-thread reply is already generating: queue under the pending assistant reply,
       * or start a sibling branch from the anchor of the in-flight send (`privateBranch` follows the composer checkbox).
       */
      busySendMode?: "queue" | "branch";
    }
  | { type: "editUserMessage" }
  | { type: "select"; id: string }
  | { type: "selectionHistoryBack" }
  | { type: "selectionHistoryForward" }
  | { type: "treeContextMenu"; id: string }
  | {
      type: "messageContextAction";
      eventId: string;
      action: "copy" | "edit" | "star" | "title" | "resend" | "addNote";
    }
  | { type: "selectTip" }
  | { type: "refresh" }
  | { type: "cancel"; runId?: string }
  | { type: "resend" }
  | { type: "setAgentModel"; model: string }
  | { type: "openAgentModelPicker" }
  | { type: "setAgentMode"; mode: string }
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
  | { type: "clearSideChatGraphReference" }
  | { type: "selectSideChatReference"; kind: "event"; eventId: string }
  | { type: "selectSideChatReference"; kind: "note"; eventId: string; noteId: string }
  | { type: "selectSideChatReference"; kind: "reply"; seq: number }
  | { type: "openMembers" }
  | { type: "addMember" }
  | { type: "dismissGettingStarted" }
  | { type: "dismissTryThisNext" }
  | { type: "dismissSoloCollaboratorHint" }
  | { type: "tryThisNext"; step: "invite" | "branch" | "sideChat" }
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
  | { type: "createList" }
  | { type: "renameList"; listId: string }
  | { type: "deleteList"; listId: string }
  | { type: "deleteListItem"; listId: string; itemId: string }
  | { type: "openListItem"; listId: string; itemId: string }
  | {
      type: "createListItem";
      listId: string;
      eventId: string;
      selectedText: string;
      anchorJson: Record<string, unknown>;
      sourceContentHash?: string | null;
    }
  | { type: "chooseListForSelection"; selection: Record<string, unknown> | null }
  | { type: "createListItemWithNewList"; selection: Record<string, unknown> | null }
  | { type: "rename" }
  | { type: "togglePin" }
  | { type: "toggleStar" }
  | { type: "addNote" }
  | { type: "editMessageTitle" }
  | { type: "listNotesOnSelection" }
  | { type: "deleteMessageBranch" }
  | { type: "restoreMessageBranch" }
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
  api: ColcoorClient;
  agent: AgentRunner;
  getWorkspaceRoot: () => string;
  /** Offline single-user mode: collaboration features (side chat) are unavailable. */
  localMode?: boolean;
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
  /** Prefill composer from selected user message and select its parent (branch edit). */
  editUserMessage: () => Promise<void>;
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
  /** Show dismissible “try this next” hints in the open conversation panel. */
  armTryThisNextForConversation: (conversationId: string) => Promise<void>;
  /** Attach main-thread message/note ids to the next inline side-chat send (cleared after send or conversation switch). */
  queueSideChatGraphReferenceForNextSend: (eventId: string | null, noteId: string | null) => void;
  /** Play side-chat sound preview in the open webview. */
  previewSideChatSound: (kind: "message" | "mention") => Promise<boolean>;
  dispose: () => void;
} {
  const { api, agent, getWorkspaceRoot } = options;
  const localMode = Boolean(options.localMode);
  async function notifySideChatUnavailableInLocalMode(): Promise<void> {
    await vscode.window.showInformationMessage(
      "Colcoor is in offline (local) mode — side chat is not available. It needs the Colcoor backend and collaborators.",
    );
  }

  let panel: vscode.WebviewPanel | undefined;
  let webviewReady = false;
  let webviewAudioUnlocked = false;
  let conversationId: string | undefined;
  let conversationTitle: string | null | undefined;
  let conversationMetadataJson: Record<string, unknown> | null | undefined;
  let conversationPinned = false;
  /** Side-chat unread for the open conversation (from list row or parallel list fetch). */
  let sideChatUnreadCount = 0;
  let sideChatHasUnread = false;
  let selectedEventId: string | undefined;
  const activeMainRunsByRunId = new Map<string, ActiveMainRun>();
  const activeMainRunIdByUserEventId = new Map<string, string>();

  /** When `true`, at least one main-thread run is active (palette keybindings can use this). */
  function syncConversationReplyInProgressContext(): void {
    void vscode.commands.executeCommand(
      "setContext",
      COLCOOR_CONVERSATION_REPLY_IN_PROGRESS_CONTEXT,
      activeMainRunsByRunId.size > 0,
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
  /** Private user-created Lists and items aligned with the last successful tree load. */
  let lastConversationLists: ConversationListOut[] = [];
  let lastConversationListItems: ConversationListItemOut[] = [];
  /** From GET …/caller-state after each successful tree load (domain-model §4). */
  let lastNeedsContextRebuild = false;
  /** One-time dedupe key for stale-tree prompt when selected node disappears after refresh. */
  let staleTreePromptedForEventId: string | null = null;
  /** Dedupe for “remote collaborator posted” growth prompt ([ui-features.md] §11). */
  let staleTreePromptedForGrowthFingerprint: string | null = null;
  /** Last valid tree selection per conversation (restored when switching back). */
  const lastSelectedEventIdByConversation = new Map<string, string>();
  /** Cached GET /me id — avoids repeated calls when checking collaborative tree growth. */
  let viewerUserIdMemo: string | undefined;
  /** Data URLs for `user_input` rows with `colcoor_user_media`, built on each tree refresh for thread HTML. */
  let lastUserImageDataUrlsByEventId: ReadonlyMap<string, readonly string[]> = new Map();
  /** Consumed once in {@link postState} to fill the main composer. */
  let pendingComposerPrefill: ComposerPrefillPayload | null = null;
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
  /** Next inline side-chat POST includes these main-thread refs (until sent or cleared). */
  let pendingSideChatReferencedEventId: string | null = null;
  let pendingSideChatReferencedNoteId: string | null = null;
  let sideChatSseAbort: AbortController | undefined;
  let inlineSideChatSseConversationId: string | undefined;
  let inlineSideChatSseSessionId: string | undefined;
  let inlineSideChatSseStatus: "reconnecting" | "restored" | null = null;
  let inlineSideChatSseWasReconnecting = false;
  let sideChatSseRefreshAfterRestoreTimer: ReturnType<typeof setTimeout> | undefined;
  let sideChatSseReconnectUiTimer: ReturnType<typeof setTimeout> | undefined;
  let sideChatSseRestoredUiTimer: ReturnType<typeof setTimeout> | undefined;
  const SIDE_CHAT_SSE_RECONNECT_UI_DELAY_MS = 600;
  const SIDE_CHAT_SSE_RESTORED_UI_MS = 2_500;
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
  /** Bumps when the user explicitly changes tree selection (not programmatic refresh). */
  let selectionRevision = 0;

  function noteExplicitSelectionChange(nextId: string): void {
    const trimmed = nextId.trim();
    if (!trimmed || trimmed === selectedEventId) {
      return;
    }
    selectionRevision += 1;
  }

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
      postState(lastTreeEvents, lastPostedBusy, lastPostedError, { preserveThreadScroll: true });
    } catch (e) {
      reportPanelApiError(e);
      const msg = e instanceof Error ? e.message : String(e);
      await loadTreeAndPush(lastPostedBusy, msg);
    }
  }

  async function refreshListsIntoCachedStateAndPost(): Promise<void> {
    if (!conversationId) {
      return;
    }
    try {
      const bundle = await api.listConversationLists(conversationId);
      lastConversationLists = bundle.lists;
      lastConversationListItems = bundle.items;
      postState(lastTreeEvents, lastPostedBusy, lastPostedError, { preserveThreadScroll: true });
    } catch (e) {
      await showColcoorApiFailure(e);
    }
  }

  function listNameById(listId: string): string {
    const row = lastConversationLists.find((l) => l.id === listId);
    return row?.name?.trim() || "List";
  }

  async function promptCreateList(): Promise<ConversationListOut | null> {
    if (!conversationId) {
      return null;
    }
    const name = await vscode.window.showInputBox({
      title: "Create List",
      prompt: "List name",
      ignoreFocusOut: true,
      validateInput: (v) => (v.trim() ? undefined : "List name required"),
    });
    if (name == null) {
      return null;
    }
    const description = await vscode.window.showInputBox({
      title: "Create List",
      prompt: "Optional description",
      ignoreFocusOut: true,
    });
    try {
      const row = await api.createConversationList(conversationId, {
        name: name.trim(),
        description: description?.trim() || null,
      });
      await refreshListsIntoCachedStateAndPost();
      return row;
    } catch (e) {
      await showColcoorApiFailure(e);
      return null;
    }
  }

  async function promptRenameList(listId: string): Promise<void> {
    if (!conversationId) {
      return;
    }
    const row = lastConversationLists.find((l) => l.id === listId);
    if (!row) {
      void vscode.window.showWarningMessage("Colcoor: List not found.");
      return;
    }
    const name = await vscode.window.showInputBox({
      title: "Rename List",
      prompt: "List name",
      value: row.name,
      ignoreFocusOut: true,
      validateInput: (v) => (v.trim() ? undefined : "List name required"),
    });
    if (name == null) {
      return;
    }
    try {
      await api.patchConversationList(conversationId, listId, { name: name.trim() });
      await refreshListsIntoCachedStateAndPost();
    } catch (e) {
      await showColcoorApiFailure(e);
    }
  }

  async function confirmDeleteList(listId: string): Promise<void> {
    if (!conversationId) {
      return;
    }
    const name = listNameById(listId);
    const yes = "Delete List";
    const pick = await vscode.window.showWarningMessage(
      `Delete List "${name}" and all of its items?`,
      { modal: true },
      yes,
    );
    if (pick !== yes) {
      return;
    }
    try {
      await api.deleteConversationList(conversationId, listId);
      await refreshListsIntoCachedStateAndPost();
    } catch (e) {
      await showColcoorApiFailure(e);
    }
  }

  async function deleteListItemAndRefresh(listId: string, itemId: string): Promise<void> {
    if (!conversationId) {
      return;
    }
    try {
      await api.deleteConversationListItem(conversationId, listId, itemId);
      await refreshListsIntoCachedStateAndPost();
    } catch (e) {
      await showColcoorApiFailure(e);
    }
  }

  function normalizeSelectionPayload(raw: Record<string, unknown> | null | undefined): {
    eventId: string;
    selectedText: string;
    anchorJson: Record<string, unknown>;
    sourceContentHash: string | null;
  } | null {
    if (!raw || typeof raw !== "object") {
      return null;
    }
    const eventId = typeof raw.eventId === "string" ? raw.eventId.trim() : "";
    const selectedText = typeof raw.selectedText === "string" ? raw.selectedText.trim() : "";
    const anchorJson =
      raw.anchor && typeof raw.anchor === "object" && !Array.isArray(raw.anchor)
        ? (raw.anchor as Record<string, unknown>)
        : raw.anchorJson && typeof raw.anchorJson === "object" && !Array.isArray(raw.anchorJson)
          ? (raw.anchorJson as Record<string, unknown>)
          : null;
    const sourceContentHash =
      typeof raw.sourceContentHash === "string" && raw.sourceContentHash.trim()
        ? raw.sourceContentHash.trim()
        : null;
    if (!eventId || !selectedText || !anchorJson) {
      return null;
    }
    return { eventId, selectedText, anchorJson, sourceContentHash };
  }

  async function createListItemFromSelection(
    listId: string,
    selection: {
      eventId: string;
      selectedText: string;
      anchorJson: Record<string, unknown>;
      sourceContentHash: string | null;
    },
  ): Promise<void> {
    if (!conversationId) {
      return;
    }
    try {
      const item = await api.createConversationListItem(conversationId, listId, {
        event_id: selection.eventId,
        selected_text: selection.selectedText,
        anchor_json: selection.anchorJson,
        source_content_hash: selection.sourceContentHash,
      });
      await refreshListsIntoCachedStateAndPost();
      try {
        await panel?.webview.postMessage({
          type: "focusListItem",
          listId,
          itemId: item.id,
        });
      } catch {
        /* webview gone */
      }
    } catch (e) {
      await showColcoorApiFailure(e);
    }
  }

  async function chooseListAndCreateItem(rawSelection: Record<string, unknown> | null): Promise<void> {
    const selection = normalizeSelectionPayload(rawSelection);
    if (!selection) {
      void vscode.window.showWarningMessage("Colcoor: selected text is no longer available.");
      return;
    }
    if (lastConversationLists.length === 0) {
      const created = await promptCreateList();
      if (created) {
        await createListItemFromSelection(created.id, selection);
      }
      return;
    }
    const pick = await vscode.window.showQuickPick(
      [
        ...lastConversationLists.map((l) => ({
          label: l.name,
          description: `${l.item_count ?? 0} items`,
          listId: l.id,
        })),
        { label: "Create new List...", description: "", listId: "__create__" },
      ],
      { title: "Add selected text to List", placeHolder: "Choose a List" },
    );
    if (!pick) {
      return;
    }
    if (pick.listId === "__create__") {
      const created = await promptCreateList();
      if (created) {
        await createListItemFromSelection(created.id, selection);
      }
      return;
    }
    await createListItemFromSelection(pick.listId, selection);
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
      conversationMetadataJson = row.metadata_json ?? null;
      applySideChatUnreadFromListRow(row);
    }
  }

  function contextSavingsForWebview(): WebviewStateMessage["contextSavings"] {
    const aggregate = readConversationContextSavingsAggregate(conversationMetadataJson);
    if (!aggregate || aggregate.counted_generations <= 0 || aggregate.total_tokens_saved <= 0) {
      return null;
    }
    return {
      tokensSaved: aggregate.total_tokens_saved,
      percentSaved: aggregate.percent_saved,
      totalLinearContextTokens: aggregate.total_linear_context_tokens,
      countedGenerations: aggregate.counted_generations,
    };
  }

  async function persistConversationContextSavings(
    turn: ContextSavingsTurn | undefined,
    assistantText: string | null | undefined,
  ): Promise<void> {
    if (!conversationId || !turn) {
      return;
    }
    const assistantTokens = estimateLinearMessageTokens(assistantText ?? null);
    const nextMetadata = mergeConversationContextSavingsMetadata(
      conversationMetadataJson,
      turn,
      turn.linear_prompt_tokens + assistantTokens,
    );
    try {
      const out = await api.patchConversation(conversationId, { metadata_json: nextMetadata });
      applyConversationMetaFromListRow(out);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      getColcoorOutputLog().appendLine(`Context savings metadata update failed: ${msg}`);
      conversationMetadataJson = nextMetadata;
    }
  }

  async function incrementConversationLinearContextTokens(tokensToAdd: number): Promise<void> {
    if (!conversationId || tokensToAdd <= 0) {
      return;
    }
    const nextMetadata = mergeConversationLinearContextTokenIncrement(
      conversationMetadataJson,
      tokensToAdd,
    );
    try {
      const out = await api.patchConversation(conversationId, { metadata_json: nextMetadata });
      applyConversationMetaFromListRow(out);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      getColcoorOutputLog().appendLine(`Linear context metadata update failed: ${msg}`);
      conversationMetadataJson = nextMetadata;
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

  function clearPendingSideChatGraphReference(): void {
    pendingSideChatReferencedEventId = null;
    pendingSideChatReferencedNoteId = null;
  }

  function applyPendingSideChatGraphReference(eventId: string | null, noteId: string | null): void {
    pendingSideChatReferencedEventId = normalizeSideChatReferenceId(
      typeof eventId === "string" ? eventId : undefined,
    );
    pendingSideChatReferencedNoteId = normalizeSideChatReferenceId(
      typeof noteId === "string" ? noteId : undefined,
    );
  }

  function pendingSideChatGraphReferenceSummaryForWebview(): string | null {
    if (pendingSideChatReferencedNoteId) {
      const nid = pendingSideChatReferencedNoteId;
      let text: string | undefined = sideChatNoteLabelsById[nid];
      if (!text) {
        const n = lastNotes.find((x) => x.id === nid);
        text = n ? shortTreeNoteLabelForSideChat(n) : undefined;
      }
      return text ? `Note · ${text}` : "Note";
    }
    if (pendingSideChatReferencedEventId) {
      const eid = pendingSideChatReferencedEventId;
      let text: string | undefined = sideChatEventLabelsById[eid];
      if (!text) {
        const ev = lastTreeEvents.find((x) => x.id === eid);
        text = ev ? shortTreeEventLabelForSideChat(ev) : undefined;
      }
      return text ? `Message · ${text}` : "Message";
    }
    return null;
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

  function clearSideChatSseUiTimers(): void {
    if (sideChatSseReconnectUiTimer != null) {
      clearTimeout(sideChatSseReconnectUiTimer);
      sideChatSseReconnectUiTimer = undefined;
    }
    if (sideChatSseRestoredUiTimer != null) {
      clearTimeout(sideChatSseRestoredUiTimer);
      sideChatSseRestoredUiTimer = undefined;
    }
  }

  function refreshSideChatSseBannerInWebview(): void {
    if (!panel || !webviewReady) {
      return;
    }
    postState(lastTreeEvents, lastPostedBusy, lastPostedError);
  }

  function onSideChatSseStreamActivity(): void {
    if (sideChatSseReconnectUiTimer != null) {
      clearTimeout(sideChatSseReconnectUiTimer);
      sideChatSseReconnectUiTimer = undefined;
    }
    if (inlineSideChatSseWasReconnecting) {
      inlineSideChatSseWasReconnecting = false;
      inlineSideChatSseStatus = "restored";
      if (sideChatSseRestoredUiTimer != null) {
        clearTimeout(sideChatSseRestoredUiTimer);
      }
      sideChatSseRestoredUiTimer = setTimeout(() => {
        inlineSideChatSseStatus = null;
        sideChatSseRestoredUiTimer = undefined;
        refreshSideChatSseBannerInWebview();
      }, SIDE_CHAT_SSE_RESTORED_UI_MS);
      if (sideChatSseRefreshAfterRestoreTimer != null) {
        clearTimeout(sideChatSseRefreshAfterRestoreTimer);
      }
      sideChatSseRefreshAfterRestoreTimer = setTimeout(() => {
        sideChatSseRefreshAfterRestoreTimer = undefined;
        if (conversationId && inlineSideChatVisible) {
          void refreshInlineSideChat().catch((e) => reportPanelApiError(e));
        }
      }, 400);
    } else {
      inlineSideChatSseStatus = null;
    }
    refreshSideChatSseBannerInWebview();
  }

  function onSideChatSseReconnect(info: { attempt: number; delayMs: number; reason: string }): void {
    const cid = inlineSideChatSseConversationId;
    const session = inlineSideChatSseSessionId ?? "unknown";
    getColcoorOutputLog().appendLine(
      `[side-chat SSE] session=${session} conversation=${cid ?? "?"} attempt=${info.attempt} delayMs=${info.delayMs} — ${info.reason}`,
    );
    if (info.delayMs <= 0) {
      return;
    }
    inlineSideChatSseWasReconnecting = true;
    if (sideChatSseReconnectUiTimer != null) {
      return;
    }
    sideChatSseReconnectUiTimer = setTimeout(() => {
      sideChatSseReconnectUiTimer = undefined;
      if (inlineSideChatSseWasReconnecting) {
        inlineSideChatSseStatus = "reconnecting";
        refreshSideChatSseBannerInWebview();
      }
    }, SIDE_CHAT_SSE_RECONNECT_UI_DELAY_MS);
  }

  function stopInlineSideChatSse(): void {
    sideChatSseAbort?.abort();
    sideChatSseAbort = undefined;
    inlineSideChatSseConversationId = undefined;
    inlineSideChatSseSessionId = undefined;
    inlineSideChatSseStatus = null;
    inlineSideChatSseWasReconnecting = false;
    clearSideChatSseUiTimers();
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
    inlineSideChatSseSessionId = `${cid.slice(0, 8)}-${Date.now().toString(36)}`;
    inlineSideChatSseStatus = null;
    inlineSideChatSseWasReconnecting = false;
    clearSideChatSseUiTimers();

    void runInlineSideChatSseLoop({
      api,
      conversationId: cid,
      sseSessionId: inlineSideChatSseSessionId,
      getAfterSeq: () => maxStableSideChatSeq(inlineSideChatRows),
      signal: ac.signal,
      stopped: () =>
        inlineSideChatSseConversationId !== cid || conversationId !== cid || panel == null,
      onReconnect: onSideChatSseReconnect,
      onStreamActivity: onSideChatSseStreamActivity,
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
          myUserId: me?.id ?? null,
          myMentionTargets: mentionTargetsForMe(me),
          incoming,
          messageSoundEnabled: cue.messageSoundEnabled,
          mentionSoundEnabled: cue.mentionSoundEnabled,
        });
        // VS Code may queue webview messages while the tab is hidden; only play when visible
        // to avoid delayed burst playback when the user returns.
        if (soundKind && webviewReady && panel.visible) {
          try {
            await panel.webview.postMessage({
              type: "playSound",
              kind: soundKind,
              volume: cue.soundVolume,
            });
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
    }).catch((e) => {
      if (ac.signal.aborted || inlineSideChatSseConversationId !== cid) {
        return;
      }
      reportPanelApiError(e);
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
      lastNotes,
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
      reportPanelApiError(e);
    }
  }

  async function openInlineSideChatDrawer(): Promise<void> {
    if (localMode) {
      await notifySideChatUnavailableInLocalMode();
      return;
    }
    if (conversationId) {
      dismissedInlineSideChatByConversationId.delete(conversationId);
    }
    inlineSideChatVisible = true;
    try {
      await refreshConversationMeta();
      await refreshInlineSideChat();
      await markInlineSideChatReadFromCache(true);
    } catch (e) {
      reportPanelApiError(e);
    }
    postState(lastTreeEvents, hasActiveMainRuns(), null);
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
        postState(lastTreeEvents, hasActiveMainRuns(), null);
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
      postState(lastTreeEvents, hasActiveMainRuns(), null);
      await markInlineSideChatReadFromCache(true);
      await refreshConversationMeta();
    } catch (e) {
      inlineSideChatRows = inlineSideChatRows.filter((m) => m.id !== job.tempId);
      inlineSideChatUrlsByMessageId.delete(job.tempId);
      rebuildInlineSideChatRendered();
      postState(lastTreeEvents, hasActiveMainRuns(), null);
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
    abortAllActiveMainRuns();
    clearActiveMainRuns();
    panel?.dispose();
    panel = undefined;
    webviewReady = false;
    webviewAudioUnlocked = false;
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

  function rememberSelectionForConversation(
    convId: string,
    eventId: string | undefined,
    events: readonly GraphEventNode[],
  ): void {
    const id = eventId?.trim();
    if (!id || !events.some((e) => e.id === id)) {
      return;
    }
    lastSelectedEventIdByConversation.set(convId, id);
  }

  function cliModelForConversationRuns(): string | undefined {
    if (!conversationId) {
      return undefined;
    }
    const map = readAgentModelByConversationMap(context.workspaceState);
    return agentModelCliFlag(readSelectedAgentModelForConversation(map, conversationId));
  }

  function cliModeForConversationRuns(): CursorCliMode {
    const map = readAgentModeByConversationMap(context.workspaceState);
    return conversationId
      ? readSelectedAgentModeForConversation(map, conversationId)
      : "ask";
  }

  function assistantModelLabelForCurrentSelection(): string | null {
    const map = readAgentModelByConversationMap(context.workspaceState);
    const selected = conversationId
      ? readSelectedAgentModelForConversation(map, conversationId)
      : AGENT_MODEL_AUTO;
    const catalog = getAgentModelCatalog();
    const cliModel = agentModelCliFlag(selected);
    const label = resolveAgentModelShortLabel(cliModel ?? selected, catalog);
    return label ?? null;
  }

  function newMainRunId(): string {
    return `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function toolApprovalBranchLabel(message: string): string {
    const t = normalizePersistedUserInputText(message).replace(/\s+/g, " ").trim();
    if (!t) {
      return "Parallel reply";
    }
    return t.length > 72 ? `${t.slice(0, 69)}…` : t;
  }

  function hasActiveMainRuns(): boolean {
    return activeMainRunsByRunId.size > 0;
  }

  function findRunForEventId(eventId: string | undefined): ActiveMainRun | undefined {
    const id = eventId?.trim();
    if (!id) {
      return undefined;
    }
    const direct = activeMainRunsByRunId.get(id);
    if (direct) {
      return direct;
    }
    const byUser = activeMainRunIdByUserEventId.get(id);
    if (byUser) {
      return activeMainRunsByRunId.get(byUser);
    }
    for (const run of activeMainRunsByRunId.values()) {
      if (run.userEventId === id || run.assistantEventId === id) {
        return run;
      }
      if (!run.userEventId && run.anchorParentEventId === id) {
        return run;
      }
    }
    return undefined;
  }

  function selectedMainRunState(run: ActiveMainRun | undefined): SelectedMainRunState | null {
    if (!run) {
      return null;
    }
    return {
      runId: run.runId,
      anchorParentEventId: run.anchorParentEventId,
      userEventId: run.userEventId ?? null,
      queueCount: run.queue.length,
      waitingForAssistant: run.pendingUserMarkdown === undefined,
      modelLabel: run.modelLabel,
    };
  }

  function removeActiveMainRun(run: ActiveMainRun): void {
    activeMainRunsByRunId.delete(run.runId);
    if (run.userEventId) {
      activeMainRunIdByUserEventId.delete(run.userEventId);
    }
    syncConversationReplyInProgressContext();
  }

  function abortRunForSelection(runId?: string): void {
    const run = runId?.trim()
      ? activeMainRunsByRunId.get(runId.trim())
      : findRunForEventId(selectedEventId);
    run?.abort.abort();
  }

  function abortAllActiveMainRuns(): void {
    for (const run of activeMainRunsByRunId.values()) {
      run.abort.abort();
    }
  }

  function clearActiveMainRuns(): void {
    activeMainRunsByRunId.clear();
    activeMainRunIdByUserEventId.clear();
    syncConversationReplyInProgressContext();
  }

  function agentModelFieldsForWebview(): {
    agentModelOptions: CursorAgentModelEntry[];
    agentModelSelected: string;
    agentModelsListHint: string | null;
    agentModeSelected: CursorCliMode;
  } {
    const map = readAgentModelByConversationMap(context.workspaceState);
    const selected = conversationId
      ? readSelectedAgentModelForConversation(map, conversationId)
      : AGENT_MODEL_AUTO;
    const modeMap = readAgentModeByConversationMap(context.workspaceState);
    const modeSelected = conversationId
      ? readSelectedAgentModeForConversation(modeMap, conversationId)
      : "ask";
    const catalog = getAgentModelCatalog();
    const options = [...catalog.curated];
    if (selected !== AGENT_MODEL_AUTO && !options.some((o) => o.id === selected)) {
      const fromAll = catalog.all.find((e) => e.id === selected);
      options.unshift(fromAll ?? { id: selected, label: selected });
    }
    return {
      agentModelOptions: options,
      agentModelSelected: selected,
      agentModelsListHint: catalog.hint,
      agentModeSelected: modeSelected,
    };
  }

  async function showFullAgentModelPicker(): Promise<void> {
    const catalog = getAgentModelCatalog();
    if (catalog.all.length === 0) {
      scheduleRefreshAgentModelCatalog(context.secrets);
      void vscode.window.showInformationMessage(
        "Colcoor: loading Cursor CLI models… Try again in a moment, or check API key / `agent` on PATH.",
      );
      return;
    }
    if (!conversationId) {
      return;
    }
    const current = readSelectedAgentModelForConversation(
      readAgentModelByConversationMap(context.workspaceState),
      conversationId,
    );
    type PickItem = vscode.QuickPickItem & { modelId: string };
    const items: PickItem[] = [
      {
        label: "Auto",
        description: "Cursor picks the model",
        modelId: AGENT_MODEL_AUTO,
        picked: current === AGENT_MODEL_AUTO,
      },
      ...catalog.all.map((e) => ({
        label: e.label,
        description: e.id,
        modelId: e.id,
        picked: e.id === current,
      })),
    ];
    const pick = await vscode.window.showQuickPick(items, {
      title: "Colcoor — Cursor CLI model",
      placeHolder: "Full list from `agent models`",
      matchOnDescription: true,
    });
    if (!pick) {
      postState(lastTreeEvents, lastPostedBusy, lastPostedError, { preserveThreadScroll: true });
      return;
    }
    await writeSelectedAgentModelForConversation(
      context.workspaceState,
      conversationId,
      pick.modelId,
    );
    postState(lastTreeEvents, lastPostedBusy, lastPostedError, { preserveThreadScroll: true });
  }

  function scheduleRefreshCachedAgentModels(): void {
    scheduleRefreshAgentModelCatalog(context.secrets, () => {
      if (panel && conversationId && webviewReady) {
        postState(lastTreeEvents, lastPostedBusy, lastPostedError, { preserveThreadScroll: true });
      }
    });
  }

  function ensureSelectedEventInTree(
    events: GraphEventNode[],
    lineageById: ReadonlyMap<string, GraphEventNode>,
    hintIds: readonly (string | undefined)[],
  ): void {
    if (events.length === 0) {
      selectedEventId = undefined;
      return;
    }
    const visibleIds = new Set(events.map((e) => e.id));
    for (const raw of hintIds) {
      const hint = raw?.trim();
      if (!hint) {
        continue;
      }
      if (visibleIds.has(hint)) {
        selectedEventId = hint;
        return;
      }
      const resolved = lowestUndeletedAncestorId(hint, visibleIds, lineageById);
      if (resolved) {
        selectedEventId = resolved;
        return;
      }
    }
    try {
      selectedEventId = findBranchTipOrUndeletedAncestor(events, lineageById, hintIds[0]).id;
    } catch {
      const rootEv = events.find((e) => e.parent_event_id === null);
      selectedEventId = rootEv?.id ?? events[0]?.id;
    }
  }

  function postState(
    events: GraphEventNode[],
    busy: boolean,
    lastError: string | null,
    options?: { preserveThreadScroll?: boolean },
  ): void {
    if (!panel || !conversationId || !webviewReady) {
      return;
    }
    syncSideChatReferenceLabelMapsFromTree(events, lastNotes);
    const effectiveBusy = busy || hasActiveMainRuns();
    try {
      lastPostedBusy = effectiveBusy;
      lastPostedError = lastError;
      const ids = new Set(events.map((e) => e.id));
      const lineageById = mergeEventLineageById(lastTreeEvents, events);
      let sel = selectedEventId;
      if (!sel || !ids.has(sel)) {
        // During send/stream the tree snapshot may lag behind selection (new user/assistant ids).
        if (!(effectiveBusy && sel)) {
          const resolved =
            sel != null && String(sel).trim()
              ? lowestUndeletedAncestorId(String(sel), ids, lineageById)
              : undefined;
          if (resolved) {
            sel = resolved;
          } else {
            try {
              sel = findBranchTipOrUndeletedAncestor(events, lineageById, sel).id;
            } catch {
              sel = events[0]?.id ?? "";
            }
          }
          selectedEventId = sel;
        }
      }
      if (conversationId && sel && ids.has(sel)) {
        rememberSelectionForConversation(conversationId, sel, events);
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
      const selectedRun = findRunForEventId(sel);
      const selectedRunState = selectedMainRunState(selectedRun);
      const pendingUserHtml = selectedRun?.pendingUserMarkdown
        ? pendingUserHtmlForPanelState(true, selectedRun.pendingUserMarkdown)
        : null;
      const waitingForAssistant = Boolean(selectedRun && selectedRun.pendingUserMarkdown === undefined);
      const drawersModel = buildConversationDrawersModel(
        events,
        lastNotes,
        lastConversationLists,
        lastConversationListItems,
      );
      const eventsForWebview = enrichGraphEventsWithComposerDisplay(
        events,
        lastConversationMembers,
        getAgentModelCatalog(),
      );
      const msg: WebviewStateMessage = {
        type: "state",
        conversationId,
        title: conversationTitle ?? null,
        conversationPinned,
        contextSavings: contextSavingsForWebview(),
        events: eventsForWebview,
        selectedEventId: sel ?? "",
        threadSegments: buildThreadSegments(
          eventsForWebview,
          sel ?? "",
          lastNotes,
          lastUserImageDataUrlsByEventId,
        ),
        threadPlainText: appendPendingPlainThreadFragment(
          buildPlainThread(eventsForWebview, sel ?? "", lastNotes),
          Boolean(selectedRun?.pendingUserMarkdown),
          selectedRun?.pendingUserMarkdown,
        ),
        treeWidthPx,
        sideChatColumnWidthPx,
        composerTextareaHeightPx,
        treeCollapsedEventIds: prunedCollapsedEventIds(events),
        agentTraceOpen,
        needsContextRebuild: lastNeedsContextRebuild,
        busy: effectiveBusy,
        conversationLoading: conversationTreeLoading,
        lastError,
        legalPolicyLinks: listLegalPolicyLinksFromColcoorWorkspaceSection(
          vscode.workspace.getConfiguration("colcoor"),
        ),
        sideChatOpenButtonLabel: sideChatBtn.label,
        sideChatOpenButtonTitle: sideChatBtn.title,
        sideChatUnreadCount,
        pendingUserHtml,
        selectedRun: selectedRunState,
        selectedRunStreamingHtml: selectedRun?.streamHtml ?? null,
        selectedRunStreamingDisplayParts: selectedRun?.streamDisplayParts ?? [],
        activeRunCount: activeMainRunsByRunId.size,
        sideChatVisible: inlineSideChatVisible,
        sideChatSseStatus: inlineSideChatVisible ? inlineSideChatSseStatus : null,
        sideChatMessages: inlineSideChatRendered,
        sideChatLastReadSeq: effectiveSideChatLastReadSeqForWebview(),
        viewerUserId:
          viewerUserIdForWebview ??
          (typeof myProfileForSideChat?.id === "string" ? myProfileForSideChat.id : null) ??
          (typeof viewerUserIdMemo === "string" ? viewerUserIdMemo : null),
        conversationNotes: lastNotes,
        drawersStarred: drawersModel.starred,
        drawersTodos: drawersModel.todos,
        drawersLists: drawersModel.lists,
        drawersListItems: drawersModel.listItems,
        selectionVisitCanGoBack: nav.canGoBack,
        selectionVisitCanGoForward: nav.canGoForward,
        sideChatViewerRole: viewerConversationRole,
        waitingForAssistant,
        queuedMainSendCount: selectedRun?.queue.length ?? 0,
        sideChatMentionMembers: lastConversationMembers.map((m) => ({
          user_id: m.user_id,
          display_name: m.display_name ?? null,
          handle: m.handle ?? null,
          email: m.email ?? null,
        })),
        sideChatMyMentionTargets: mentionTargetsForMe(myProfileForSideChat ?? null),
        sideChatSoundVolume: readSideChatCueSettings(vscode.workspace.getConfiguration("colcoor")).soundVolume,
        pendingSideChatGraphReferenceSummary: pendingSideChatGraphReferenceSummaryForWebview(),
        ...(pendingComposerPrefill ? { composerPrefill: pendingComposerPrefill } : {}),
        ...agentModelFieldsForWebview(),
        pendingAssistantModelLabel: selectedRun?.modelLabel ?? null,
        gettingStartedVisible: isGettingStartedVisibleSync(context.globalState),
        tryThisNextVisible: isTryThisNextVisibleSync(context.globalState, conversationId),
        soloCollaboratorHintDismissed: isSoloCollaboratorHintDismissedSync(context.globalState, conversationId),
        conversationMembers: lastConversationMembers.map((m) => ({
          user_id: m.user_id,
          role: m.role,
          display_name: m.display_name ?? null,
          email: m.email ?? null,
          handle: m.handle ?? null,
        })),
        ...(options?.preserveThreadScroll ? { preserveThreadScroll: true } : {}),
      };
      pendingComposerPrefill = null;
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
        const drawersModelFb = buildConversationDrawersModel(
          [],
          lastNotes,
          lastConversationLists,
          lastConversationListItems,
        );
        const fallback: WebviewStateMessage = {
          type: "state",
          conversationId,
          title: conversationTitle ?? null,
          conversationPinned,
          contextSavings: contextSavingsForWebview(),
          events: [],
          selectedEventId: "",
          threadSegments: [],
          threadPlainText: "",
          treeWidthPx,
          sideChatColumnWidthPx,
          composerTextareaHeightPx,
          treeCollapsedEventIds: [],
          agentTraceOpen,
          needsContextRebuild: false,
          busy: effectiveBusy,
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
          selectedRun: null,
          selectedRunStreamingHtml: null,
          selectedRunStreamingDisplayParts: [],
          activeRunCount: activeMainRunsByRunId.size,
          sideChatVisible: inlineSideChatVisible,
          sideChatSseStatus: inlineSideChatVisible ? inlineSideChatSseStatus : null,
          sideChatMessages: inlineSideChatRendered,
          sideChatLastReadSeq: effectiveSideChatLastReadSeqForWebview(),
          viewerUserId:
            viewerUserIdForWebview ??
            (typeof myProfileForSideChat?.id === "string" ? myProfileForSideChat.id : null) ??
            (typeof viewerUserIdMemo === "string" ? viewerUserIdMemo : null),
          conversationNotes: lastNotes,
          drawersStarred: drawersModelFb.starred,
          drawersTodos: drawersModelFb.todos,
          drawersLists: drawersModelFb.lists,
          drawersListItems: drawersModelFb.listItems,
          selectionVisitCanGoBack: false,
          selectionVisitCanGoForward: false,
          sideChatViewerRole: viewerConversationRole,
          waitingForAssistant: false,
          queuedMainSendCount: 0,
          sideChatMentionMembers: lastConversationMembers.map((m) => ({
            user_id: m.user_id,
            display_name: m.display_name ?? null,
            handle: m.handle ?? null,
            email: m.email ?? null,
          })),
          sideChatMyMentionTargets: mentionTargetsForMe(myProfileForSideChat ?? null),
          sideChatSoundVolume: readSideChatCueSettings(vscode.workspace.getConfiguration("colcoor")).soundVolume,
          pendingSideChatGraphReferenceSummary: pendingSideChatGraphReferenceSummaryForWebview(),
          ...agentModelFieldsForWebview(),
          pendingAssistantModelLabel: null,
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
      /** After refresh, select this event (e.g. assistant reply just completed) instead of the default branch tip. */
      selectEventId?: string;
      /** Skip “selection no longer available” prompt (e.g. after local subtree delete). */
      skipStaleSelectionPrompt?: boolean;
      skipConversationsList?: boolean;
      prefetchedTreeEvents?: GraphEventNode[];
      prefetchedNotes?: NoteOut[];
      skipInlineSideChatRefresh?: boolean;
      /** Keep the current tree selection; do not overwrite from backend active_event_id. */
      preserveLocalSelection?: boolean;
      preserveThreadScroll?: boolean;
    },
  ): Promise<void> {
    await withTreeRefreshLock(async () => {
      if (!conversationId) {
        return;
      }
      const skipConversationsList = Boolean(opts?.skipConversationsList);
      const skipInlineSideChatRefresh = Boolean(opts?.skipInlineSideChatRefresh);
      const preserveLocalSelection = Boolean(opts?.preserveLocalSelection);
      const preserveThreadScroll = Boolean(opts?.preserveThreadScroll);
      let finalizeToDefaultBranchTip = Boolean(opts?.finalizeToDefaultBranchTip);
      const explicitSelectEventId =
        typeof opts?.selectEventId === "string" ? opts.selectEventId.trim() : "";
      let treePrefetch: GraphEventNode[] | undefined = opts?.prefetchedTreeEvents;
      let notesPrefetch: NoteOut[] | undefined = opts?.prefetchedNotes;
      conversationTreeLoading = !busy;
      if (!busy && lastTreeEvents.length > 0) {
        postState(lastTreeEvents, lastPostedBusy, null);
      }
      for (;;) {
        try {
          const hadInlineSideChatOpenAtTreeLoad = inlineSideChatVisible;
          const previousSelectedEventId = selectedEventId;
          const cachedSelectionForConversation = conversationId
            ? lastSelectedEventIdByConversation.get(conversationId)
            : undefined;
          const previousEventIds = new Set(lastTreeEvents.map((e) => e.id));
          const treeP =
            treePrefetch !== undefined
              ? Promise.resolve({ events: treePrefetch })
              : api.getTree(conversationId);
          const notesP =
            notesPrefetch !== undefined ? Promise.resolve(notesPrefetch) : api.listNotes(conversationId);
          const listsP = api
            .listConversationLists(conversationId)
            .catch(() => ({ lists: [] as ConversationListOut[], items: [] as ConversationListItemOut[] }));
          const membersP = api.listConversationMembers(conversationId).catch((): ConversationMember[] => []);
          const [{ events }, notes, listsBundle, caller, listRows, members] = await Promise.all([
            treeP,
            notesP,
            listsP,
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
          lastConversationLists = listsBundle.lists;
          lastConversationListItems = listsBundle.items;
          const lineageById = mergeEventLineageById(lastTreeEvents, events);
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
            if (!busy && !explicitSelectEventId && !hasActiveMainRuns() && !preserveLocalSelection) {
              const aidRaw = caller.active_event_id;
              const aid =
                typeof aidRaw === "string" && aidRaw.trim() ? aidRaw.trim() : "";
              if (aid) {
                const resolved = lowestUndeletedAncestorId(aid, nextEventIds, lineageById);
                if (resolved) {
                  selectedEventId = resolved;
                }
              }
            }
          } else {
            lastNeedsContextRebuild = false;
            lastSideChatReadSeq = 0;
            viewerUserIdForWebview = null;
            viewerConversationRole = null;
          }
          if (selectedEventId && !events.some((e) => e.id === selectedEventId)) {
            const reconciled = lowestUndeletedAncestorId(
              selectedEventId,
              nextEventIds,
              lineageById,
            );
            if (reconciled) {
              selectedEventId = reconciled;
            } else {
              const aidRaw = caller?.active_event_id;
              const aid =
                typeof aidRaw === "string" && aidRaw.trim() ? aidRaw.trim() : "";
              const fromActive =
                aid !== ""
                  ? lowestUndeletedAncestorId(aid, nextEventIds, lineageById)
                  : undefined;
              if (fromActive) {
                selectedEventId = fromActive;
              } else {
                const rootEv = events.find((e) => e.parent_event_id === null);
                selectedEventId = rootEv?.id ?? events.at(-1)?.id;
              }
            }
          }
          if (members.length > 1 && !dismissedInlineSideChatByConversationId.has(conversationId)) {
            inlineSideChatVisible = true;
          }
          if (selectedEventId && nextEventIds.has(selectedEventId)) {
            staleTreePromptedForEventId = null;
          }
          if (!busy && stalePromptKey && !opts?.skipStaleSelectionPrompt) {
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
          if (explicitSelectEventId && events.some((e) => e.id === explicitSelectEventId)) {
            selectedEventId = explicitSelectEventId;
          } else if (finalizeToDefaultBranchTip && events.length > 0) {
            try {
              selectedEventId = findBranchTipOrUndeletedAncestor(
                events,
                lineageById,
                previousSelectedEventId,
              ).id;
            } catch {
              selectedEventId = events.at(-1)?.id;
            }
          } else if (
            !selectedEventId ||
            !events.some((e) => e.id === selectedEventId)
          ) {
            ensureSelectedEventInTree(events, lineageById, [
              cachedSelectionForConversation,
              selectedEventId,
              caller?.active_event_id ?? undefined,
              previousSelectedEventId,
            ]);
          }
          const imageFetchP = buildUserImageDataUrlsByEventId(api, conversationId, events).catch(
            () => new Map<string, string[]>(),
          );
          const sideChatRefreshP =
            inlineSideChatVisible && !skipInlineSideChatRefresh
              ? refreshInlineSideChat().catch((e) => {
                  inlineSideChatRows = [];
                  inlineSideChatUrlsByMessageId = new Map();
                  inlineSideChatRendered = [];
                  reportPanelApiError(e);
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
          postState(events, busy, lastError, {
            ...(preserveThreadScroll ? { preserveThreadScroll: true } : {}),
          });
          if (members.length > 1) {
            ensureInlineSideChatSseForConversation();
          } else {
            stopInlineSideChatSse();
          }
          return;
        } catch (e) {
          reportPanelApiError(e);
          const msg = e instanceof Error ? e.message : String(e);
          lastNotes = [];
          lastConversationLists = [];
          lastConversationListItems = [];
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

  async function resolveMainSendMediaRefs(
    pastedImages: { dataUrl: string }[] | undefined,
    existingRefs: ColcoorUserMediaImageRef[] | undefined,
  ): Promise<ColcoorUserMediaImageRef[]> {
    const uploaded = await uploadPastedImagesForMainSend(pastedImages);
    return mergeUserMediaImageRefs(existingRefs ?? [], uploaded);
  }

  function createStreamForRun(run: ActiveMainRun): ReturnType<typeof createAssistantStreamPusher> {
    return createAssistantStreamPusher(() => panel, () => webviewReady, {
      runId: run.runId,
      onFlush: (frame) => {
        run.streamHtml = frame.html || null;
        run.streamDisplayParts = Array.isArray(frame.displayParts) ? frame.displayParts : [];
      },
    });
  }

  async function drainMainSendQueue(run: ActiveMainRun, initialAssistantId: string | undefined): Promise<string | undefined> {
    let mainAssistant = initialAssistantId;
    if (!conversationId) {
      return mainAssistant;
    }
    const ws = getWorkspaceRoot();
    const sig = run.abort.signal;
    if (!sig) {
      return mainAssistant;
    }
    while (run.queue.length > 0) {
      const item = run.queue.shift()!;
      const selectionAtQueuedSendStart = selectedEventId;
      const selectionRevisionAtQueuedSendStart = selectionRevision;
      const stream = createStreamForRun(run);
      try {
        const refs = await resolveMainSendMediaRefs(item.images, item.imageRefs);
        const trimmed = normalizePersistedUserInputText(item.text);
        if (!trimmed && refs.length === 0) {
          stream.dispose();
          continue;
        }
        const userMediaContentJson = refs.length > 0 ? buildUserMediaContentJson(refs) : undefined;
        const replyParent = mainAssistant ?? undefined;
        if (replyParent === undefined) {
          stream.dispose();
          void vscode.window.showWarningMessage(
            "Colcoor: skipped a queued message — no assistant reply to attach under.",
          );
          continue;
        }
        run.pendingUserMarkdown = trimmed || (refs.length > 0 ? "_Image_…" : "");
        run.streamHtml = null;
        run.streamDisplayParts = [];
        postState(lastTreeEvents, true, lastPostedError);
        const result = await runColcoorUserTurn(
          api,
          agent,
          conversationId,
          conversationTitle,
          trimmed,
          ws,
          {
            replyParentEventId: replyParent,
            privateBranch: item.privateBranch,
            signal: sig,
            onAssistantTextDelta: (t) => stream.pushDelta(t),
            onAssistantDisplayParts: (parts) => stream.pushDisplayParts(parts),
            cliModel: item.cliModel,
            cliMode: item.cliMode,
            linearContextTokensBeforeRun: currentLinearContextTokens(conversationMetadataJson),
            toolApprovalBranchLabel: toolApprovalBranchLabel(trimmed || "Queued message"),
            ...(userMediaContentJson ? { userMediaContentJson } : {}),
            onUserMessagePersisted: async ({ userEventId }) => {
              const previousRunUserEventId = run.userEventId;
              run.pendingUserMarkdown = undefined;
              run.userEventId = userEventId;
              activeMainRunIdByUserEventId.set(userEventId, run.runId);
              const shouldSelectQueuedUser =
                selectionRevision === selectionRevisionAtQueuedSendStart &&
                selectedEventId === selectionAtQueuedSendStart &&
                (selectedEventId === previousRunUserEventId ||
                  selectedEventId === run.assistantEventId);
              if (shouldSelectQueuedUser) {
                selectedEventId = userEventId;
              }
              await loadTreeAndPush(true, null, {
                skipConversationsList: true,
                skipInlineSideChatRefresh: true,
                ...(shouldSelectQueuedUser ? { selectEventId: userEventId } : {}),
              });
            },
          },
        );
        stream.dispose();
        await persistConversationContextSavings(result.contextSavings, result.assistantText);
        postState(lastTreeEvents, true, lastPostedError);
        if (result.cancelled) {
          break;
        }
        if (result.assistantEventId) {
          mainAssistant = result.assistantEventId;
          run.assistantEventId = result.assistantEventId;
        }
      } catch (e) {
        stream.dispose();
        reportPanelApiError(e);
        const msg = e instanceof Error ? e.message : String(e);
        await loadTreeAndPush(false, msg);
        break;
      }
    }
    return mainAssistant;
  }

  async function handleEditUserMessage(targetEventId?: string): Promise<void> {
    const eventId = (targetEventId ?? selectedEventId)?.trim();
    const gate = evaluateEditUserMessageGate(conversationId, eventId, lastTreeEvents);
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
        'Colcoor: edit only applies to a user message — select a "User" row in the tree.',
      );
      return;
    }
    if (gate === "empty_user_body") {
      void vscode.window.showWarningMessage(
        "Colcoor: that user message has no text or images to edit.",
      );
      return;
    }
    if (gate === "no_parent" || gate === "parent_not_in_tree") {
      void vscode.window.showWarningMessage(
        "Colcoor: cannot edit the conversation root — select a user message with a parent.",
      );
      return;
    }
    const userEv = lastTreeEvents.find((e) => e.id === eventId);
    if (!userEv || userEv.kind !== "user_input") {
      return;
    }
    const parentId =
      userEv.parent_event_id != null ? String(userEv.parent_event_id).trim() : "";
    if (!parentId) {
      return;
    }
    const previews = lastUserImageDataUrlsByEventId.get(userEv.id);
    pendingComposerPrefill = buildComposerPrefillFromUserEvent(userEv, previews);
    const prevSel = selectedEventId;
    selectedEventId = parentId;
    postState(lastTreeEvents, lastPostedBusy, lastPostedError);
    void syncActiveToBackend(parentId, {
      needsContextRebuild: prevSel !== undefined && prevSel !== parentId,
    });
    void vscode.window.setStatusBarMessage(
      "Colcoor: composer filled — edit and send to branch from the parent message.",
      3000,
    );
  }

  async function handleSend(
    text: string,
    privateBranch: boolean,
    pastedImages?: { dataUrl: string }[],
    imageRefs?: ColcoorUserMediaImageRef[],
    busySendMode?: "queue" | "branch",
  ): Promise<void> {
    const trimmed = normalizePersistedUserInputText(text);
    const hasPasted =
      Array.isArray(pastedImages) && pastedImages.some((x) => typeof x?.dataUrl === "string" && x.dataUrl.trim());
    const hasRefs =
      Array.isArray(imageRefs) &&
      imageRefs.some((r) => typeof r?.id === "string" && r.id.trim() && typeof r?.mime_type === "string");
    if ((!trimmed && !hasPasted && !hasRefs) || !conversationId || !selectedEventId) {
      return;
    }

    const selectedRun = findRunForEventId(selectedEventId);
    if (selectedRun && selectedRun.userEventId) {
      if (!busySendMode) {
        void vscode.window.showInformationMessage(
          "Colcoor: this message is already waiting for an answer. Use “Queue after reply” or “New branch”, or press Stop.",
        );
        return;
      }
      if (selectedRun.pendingUserMarkdown !== undefined) {
        void vscode.window.showWarningMessage(
          "Colcoor: wait until your message appears in the thread, then you can queue or branch.",
        );
        return;
      }
      if (busySendMode === "queue") {
        selectedRun.queue.push({
          kind: "after_assistant",
          text: trimmed,
          images: pastedImages,
          imageRefs,
          privateBranch,
          cliModel: cliModelForConversationRuns(),
          cliMode: cliModeForConversationRuns(),
        });
        postState(lastTreeEvents, true, lastPostedError);
        return;
      } else {
        const parent = selectedRun.anchorParentEventId || selectedEventId;
        void startMainRun({
          text: trimmed,
          privateBranch,
          pastedImages,
          imageRefs,
          replyParentEventId: parent,
          selectPersistedUser: true,
        });
        return;
      }
    }

    void startMainRun({
      text: trimmed,
      privateBranch,
      pastedImages,
      imageRefs,
      replyParentEventId: selectedEventId,
      selectPersistedUser: true,
    });
  }

  async function startMainRun(args: {
    text: string;
    privateBranch: boolean;
    pastedImages?: { dataUrl: string }[];
    imageRefs?: ColcoorUserMediaImageRef[];
    replyParentEventId: string;
    selectPersistedUser: boolean;
    existingUserEventId?: string;
  }): Promise<void> {
    if (!conversationId) {
      return;
    }
    const trimmed = normalizePersistedUserInputText(args.text);
    const hasPasted =
      Array.isArray(args.pastedImages) && args.pastedImages.some((x) => typeof x?.dataUrl === "string" && x.dataUrl.trim());
    const hasRefs =
      Array.isArray(args.imageRefs) &&
      args.imageRefs.some((r) => typeof r?.id === "string" && r.id.trim() && typeof r?.mime_type === "string");
    if (!trimmed && !hasPasted && !hasRefs) {
      return;
    }
    const ws = getWorkspaceRoot();
    const abort = new AbortController();
    const selectionAtSendStart = selectedEventId;
    const selectionRevisionAtSendStart = selectionRevision;
    const run: ActiveMainRun = {
      runId: newMainRunId(),
      anchorParentEventId: args.replyParentEventId,
      userEventId: args.existingUserEventId,
      pendingUserMarkdown: args.existingUserEventId
        ? undefined
        : trimmed || (hasPasted || hasRefs ? "_Image_…" : ""),
      queue: [],
      abort,
      streamHtml: null,
      streamDisplayParts: [],
      modelLabel: assistantModelLabelForCurrentSelection(),
      privateBranch: args.privateBranch,
      createdAt: Date.now(),
    };
    activeMainRunsByRunId.set(run.runId, run);
    if (run.userEventId) {
      activeMainRunIdByUserEventId.set(run.userEventId, run.runId);
    }
    syncConversationReplyInProgressContext();
    postState(lastTreeEvents, true, lastPostedError);
    const stream = createStreamForRun(run);
    try {
      const refs = await resolveMainSendMediaRefs(args.pastedImages, args.imageRefs);
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
          replyParentEventId: args.replyParentEventId,
          privateBranch: args.privateBranch,
          signal: abort.signal,
          onAssistantTextDelta: (t) => stream.pushDelta(t),
          onAssistantDisplayParts: (parts) => stream.pushDisplayParts(parts),
          cliModel: cliModelForConversationRuns(),
          cliMode: cliModeForConversationRuns(),
          linearContextTokensBeforeRun: currentLinearContextTokens(conversationMetadataJson),
          toolApprovalBranchLabel: toolApprovalBranchLabel(
            trimmed || (hasPasted || hasRefs ? "Image message" : "New message"),
          ),
          ...(lastTreeEvents.length > 0
            ? { prefetchedGraph: { events: lastTreeEvents, notes: lastNotes } }
            : {}),
          ...(userMediaContentJson ? { userMediaContentJson } : {}),
          onUserMessagePersisted: async ({ userEventId }) => {
            run.pendingUserMarkdown = undefined;
            run.userEventId = userEventId;
            activeMainRunIdByUserEventId.set(userEventId, run.runId);
            const shouldSelectPersistedUser = shouldAutoSelectPersistedUserMessage({
              selectPersistedUser: args.selectPersistedUser,
              selectedEventId,
              replyParentEventId: args.replyParentEventId,
              selectionAtSendStart,
              selectionRevision,
              selectionRevisionAtSendStart,
            });
            if (shouldSelectPersistedUser) {
              selectedEventId = userEventId;
            }
            await loadTreeAndPush(true, null, {
              skipConversationsList: true,
              skipInlineSideChatRefresh: true,
              ...(shouldSelectPersistedUser ? { selectEventId: userEventId } : {}),
            });
          },
        },
      );
      stream.dispose();
      await persistConversationContextSavings(result.contextSavings, result.assistantText);
      let assistantTipId = result.assistantEventId;
      if (!result.cancelled) {
        if (assistantTipId) {
          run.assistantEventId = assistantTipId;
        }
        assistantTipId = (await drainMainSendQueue(run, result.assistantEventId)) ?? assistantTipId;
      }
      const stillViewingRun =
        selectedEventId != null &&
        (selectedEventId === run.userEventId || selectedEventId === run.assistantEventId);
      await loadTreeAndPush(false, null, stillViewingRun && assistantTipId?.trim() ? { selectEventId: assistantTipId.trim() } : {});
      if (result.cancelled) {
        void vscode.window.showInformationMessage(
          result.assistantText?.trim()
            ? "Colcoor: stopped — partial assistant reply was saved."
            : "Colcoor: stopped — no assistant text was saved.",
        );
      }
    } catch (e) {
      reportPanelApiError(e);
      const msg = e instanceof Error ? e.message : String(e);
      stream.dispose();
      await loadTreeAndPush(false, msg);
    } finally {
      removeActiveMainRun(run);
      postState(lastTreeEvents, hasActiveMainRuns(), lastPostedError);
    }
  }

  async function handleResend(targetEventId?: string): Promise<void> {
    const eventId = (targetEventId ?? selectedEventId)?.trim();
    if (!conversationId || !eventId) {
      return;
    }
    if (targetEventId !== undefined && selectedEventId !== eventId) {
      const prevSel = selectedEventId;
      selectedEventId = eventId;
      if (lastTreeEvents.some((e) => e.id === eventId)) {
        postState(lastTreeEvents, hasActiveMainRuns(), lastPostedError);
      }
      void syncActiveToBackend(eventId, {
        needsContextRebuild: prevSel !== undefined && prevSel !== eventId,
      });
    }
    if (findRunForEventId(eventId)) {
      void vscode.window.showInformationMessage(
        "Colcoor: this message already has an answer in progress. Stop it before resending.",
      );
      return;
    }
    const ev = lastTreeEvents.find((e) => e.id === eventId);
    const anchorParentEventId =
      ev?.parent_event_id != null && String(ev.parent_event_id).trim()
        ? String(ev.parent_event_id).trim()
        : eventId;
    const ws = getWorkspaceRoot();
    const abort = new AbortController();
    const run: ActiveMainRun = {
      runId: newMainRunId(),
      anchorParentEventId,
      userEventId: eventId,
      queue: [],
      abort,
      streamHtml: null,
      streamDisplayParts: [],
      modelLabel: assistantModelLabelForCurrentSelection(),
      privateBranch: false,
      createdAt: Date.now(),
    };
    activeMainRunsByRunId.set(run.runId, run);
    activeMainRunIdByUserEventId.set(eventId, run.runId);
    syncConversationReplyInProgressContext();
    postState(lastTreeEvents, true, lastPostedError);
    const stream = createStreamForRun(run);
    try {
      const resendUserBody =
        lastTreeEvents.find((e) => e.id === eventId)?.content_text?.trim() || "Resend";
      const result = await runResendAssistant(
        api,
        agent,
        conversationId,
        conversationTitle,
        eventId,
        ws,
        {
          signal: abort.signal,
          onAssistantTextDelta: (t) => stream.pushDelta(t),
          onAssistantDisplayParts: (parts) => stream.pushDisplayParts(parts),
          cliModel: cliModelForConversationRuns(),
          cliMode: cliModeForConversationRuns(),
          linearContextTokensBeforeRun: currentLinearContextTokens(conversationMetadataJson),
          toolApprovalBranchLabel: toolApprovalBranchLabel(resendUserBody),
          ...(lastTreeEvents.length > 0
            ? { prefetchedGraph: { events: lastTreeEvents, notes: lastNotes } }
            : {}),
        },
      );
      stream.dispose();
      await persistConversationContextSavings(result.contextSavings, result.assistantText);
      if (result.assistantEventId) {
        run.assistantEventId = result.assistantEventId;
      }
      const stillViewingRun =
        selectedEventId === eventId || selectedEventId === run.assistantEventId;
      await loadTreeAndPush(
        false,
        null,
        stillViewingRun && result.assistantEventId?.trim()
          ? { selectEventId: result.assistantEventId.trim() }
          : {},
      );
      if (result.cancelled) {
        void vscode.window.showInformationMessage(
          result.assistantText?.trim()
            ? "Colcoor: stopped — partial assistant reply was saved."
            : "Colcoor: stopped — no assistant text was saved.",
        );
      }
    } catch (e) {
      reportPanelApiError(e);
      const msg = e instanceof Error ? e.message : String(e);
      stream.dispose();
      await loadTreeAndPush(false, msg);
    } finally {
      removeActiveMainRun(run);
      postState(lastTreeEvents, hasActiveMainRuns(), lastPostedError);
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
        webviewAudioUnlocked = false;
        scheduleRefreshCachedAgentModels();
        await loadTreeAndPush(false, null);
        return;
      }
      if (msg.type === "setAgentModel" && typeof msg.model === "string" && conversationId) {
        await writeSelectedAgentModelForConversation(
          context.workspaceState,
          conversationId,
          msg.model,
        );
        postState(lastTreeEvents, lastPostedBusy, lastPostedError, { preserveThreadScroll: true });
        return;
      }
      if (msg.type === "setAgentMode" && typeof msg.mode === "string" && conversationId) {
        await writeSelectedAgentModeForConversation(
          context.workspaceState,
          conversationId,
          msg.mode,
        );
        postState(lastTreeEvents, lastPostedBusy, lastPostedError, { preserveThreadScroll: true });
        return;
      }
      if (msg.type === "openAgentModelPicker") {
        await showFullAgentModelPicker();
        return;
      }
      if (msg.type === "audioUnlocked") {
        webviewAudioUnlocked = true;
        return;
      }
      if (msg.type === "select" && typeof msg.id === "string") {
        const nextId = msg.id.trim();
        if (!nextId) {
          return;
        }
        const prevSel = selectedEventId;
        noteExplicitSelectionChange(nextId);
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
          noteExplicitSelectionChange(nextSel);
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
          noteExplicitSelectionChange(nextSel);
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
        await loadTreeAndPush(false, null, {
          preserveLocalSelection: true,
          preserveThreadScroll: true,
        });
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
        abortRunForSelection(msg.runId);
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
      if (msg.type === "editUserMessage") {
        await handleEditUserMessage();
        return;
      }
      if (msg.type === "messageContextAction") {
        const eventId = typeof msg.eventId === "string" ? msg.eventId.trim() : "";
        const action = msg.action;
        if (
          eventId &&
          (action === "copy" ||
            action === "edit" ||
            action === "star" ||
            action === "title" ||
            action === "resend" ||
            action === "addNote")
        ) {
          await handleMessageContextAction(eventId, action);
        }
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
        applyPendingSideChatGraphReference(selectedEventId, null);
        await openInlineSideChatDrawer();
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
      if (msg.type === "createList") {
        await promptCreateList();
        return;
      }
      if (msg.type === "renameList" && typeof msg.listId === "string") {
        await promptRenameList(msg.listId);
        return;
      }
      if (msg.type === "deleteList" && typeof msg.listId === "string") {
        await confirmDeleteList(msg.listId);
        return;
      }
      if (
        msg.type === "deleteListItem" &&
        typeof msg.listId === "string" &&
        typeof msg.itemId === "string"
      ) {
        await deleteListItemAndRefresh(msg.listId, msg.itemId);
        return;
      }
      if (
        msg.type === "openListItem" &&
        typeof msg.listId === "string" &&
        typeof msg.itemId === "string"
      ) {
        if (!panel) {
          return;
        }
        try {
          await panel.webview.postMessage({
            type: "focusListItem",
            listId: msg.listId,
            itemId: msg.itemId,
          });
        } catch {
          /* webview gone */
        }
        return;
      }
      if (
        msg.type === "createListItem" &&
        typeof msg.listId === "string" &&
        typeof msg.eventId === "string" &&
        typeof msg.selectedText === "string" &&
        msg.anchorJson &&
        typeof msg.anchorJson === "object"
      ) {
        await createListItemFromSelection(msg.listId, {
          eventId: msg.eventId,
          selectedText: msg.selectedText,
          anchorJson: msg.anchorJson,
          sourceContentHash:
            typeof msg.sourceContentHash === "string" ? msg.sourceContentHash : null,
        });
        return;
      }
      if (msg.type === "chooseListForSelection") {
        await chooseListAndCreateItem(msg.selection);
        return;
      }
      if (msg.type === "createListItemWithNewList") {
        const selection = normalizeSelectionPayload(msg.selection);
        if (!selection) {
          void vscode.window.showWarningMessage("Colcoor: selected text is no longer available.");
          return;
        }
        const created = await promptCreateList();
        if (created) {
          await createListItemFromSelection(created.id, selection);
        }
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
            reportPanelApiError(e);
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
      if (msg.type === "dismissGettingStarted") {
        await dismissOnboarding(context.globalState);
        postState(lastTreeEvents, lastPostedBusy, lastPostedError);
        return;
      }
      if (msg.type === "dismissTryThisNext") {
        await dismissTryThisNext(context.globalState);
        postState(lastTreeEvents, lastPostedBusy, lastPostedError);
        return;
      }
      if (msg.type === "dismissSoloCollaboratorHint") {
        if (!conversationId) {
          return;
        }
        await dismissSoloCollaboratorHint(context.globalState, conversationId);
        postState(lastTreeEvents, lastPostedBusy, lastPostedError);
        return;
      }
      if (msg.type === "tryThisNext") {
        if (msg.step === "invite") {
          await vscode.commands.executeCommand("colcoor.addConversationMember", {
            conv: { id: conversationId, title: conversationTitle ?? null },
          });
        } else if (msg.step === "sideChat") {
          await openInlineSideChatDrawer();
        } else if (msg.step === "branch") {
          void vscode.window.showInformationMessage(
            "Colcoor: select a message in the tree to continue from, or choose Message → Edit message…, change it, and send to create a branch.",
          );
          if (panel && webviewReady) {
            void panel.webview.postMessage({ type: "focusComposer" });
          }
        }
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
      if (msg.type === "restoreMessageBranch") {
        await restoreMessageBranchFromPalette();
        return;
      }
      if (msg.type === "openSideChat") {
        await openInlineSideChatDrawer();
        return;
      }
      if (msg.type === "clearSideChatGraphReference") {
        clearPendingSideChatGraphReference();
        postState(lastTreeEvents, hasActiveMainRuns(), null);
        return;
      }
      if (msg.type === "selectSideChatReference") {
        if (!conversationId || !panel) {
          return;
        }
        if (msg.kind === "event") {
          const id = normalizeOptionalGraphEventId(typeof msg.eventId === "string" ? msg.eventId : "");
          if (id === undefined || !lastTreeEvents.some((e) => e.id === id)) {
            void vscode.window.showWarningMessage(
              `Colcoor: that message is not in the loaded tree — try ${COLOOR_REFRESH_CONVERSATION_TREE_PANEL_BUTTON_LABEL}.`,
            );
            return;
          }
          const prevSel = selectedEventId;
          selectedEventId = id;
          postState(lastTreeEvents, lastPostedBusy, lastPostedError);
          void syncActiveToBackend(id, {
            needsContextRebuild: prevSel !== undefined && prevSel !== id,
          });
          return;
        }
        if (msg.kind === "note") {
          const eid = normalizeOptionalGraphEventId(typeof msg.eventId === "string" ? msg.eventId : "");
          if (eid === undefined || !lastTreeEvents.some((e) => e.id === eid)) {
            void vscode.window.showWarningMessage(
              `Colcoor: that note’s message is not in the loaded tree — try ${COLOOR_REFRESH_CONVERSATION_TREE_PANEL_BUTTON_LABEL}.`,
            );
            return;
          }
          const prevSel = selectedEventId;
          selectedEventId = eid;
          postState(lastTreeEvents, lastPostedBusy, lastPostedError);
          void syncActiveToBackend(eid, {
            needsContextRebuild: prevSel !== undefined && prevSel !== eid,
          });
          await showNotesOnSelectedMessage();
          return;
        }
        if (msg.kind === "reply") {
          const seq = typeof msg.seq === "number" && Number.isFinite(msg.seq) ? Math.floor(msg.seq) : 0;
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
            reportPanelApiError(e);
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
      if (msg.type === "closeSideChat") {
        await markInlineSideChatReadFromCache(false);
        inlineSideChatVisible = false;
        if (conversationId) {
          dismissedInlineSideChatByConversationId.add(conversationId);
        }
        postState(lastTreeEvents, hasActiveMainRuns(), null);
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
          reportPanelApiError(e);
        }
        postState(lastTreeEvents, hasActiveMainRuns(), null);
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
        const snapEv = pendingSideChatReferencedEventId;
        const snapNote = pendingSideChatReferencedNoteId;
        const payload = buildSideChatSendPayload(
          msg.text,
          refSc,
          snapEv,
          snapNote,
          inlineSideChatRows,
          contentJson,
        );
        if (!payload) {
          void vscode.window.showWarningMessage("Colcoor: side chat message is empty.");
          return;
        }
        clearPendingSideChatGraphReference();
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
        postState(lastTreeEvents, hasActiveMainRuns(), null);

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
          postState(lastTreeEvents, hasActiveMainRuns(), null);
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
          postState(lastTreeEvents, hasActiveMainRuns(), null);
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
        await editMessageTitleForEvent();
        return;
      }
      if (msg.type === "send" && typeof msg.text === "string") {
        await handleSend(
          msg.text,
          Boolean(msg.privateBranch),
          msg.images,
          msg.imageRefs,
          msg.busySendMode,
        );
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
          await incrementConversationLinearContextTokens(estimateLinearNoteTokens(updated.content));
          void vscode.window.setStatusBarMessage("Colcoor: note updated.", 2000);
          if (lastNotes.some((n) => n.id === updated.id)) {
            lastNotes = lastNotes.map((n) => (n.id === updated.id ? updated : n));
          } else {
            lastNotes = [...lastNotes, updated];
          }
          postState(lastTreeEvents, lastPostedBusy, lastPostedError, { preserveThreadScroll: true });
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
      abortAllActiveMainRuns();
      clearActiveMainRuns();
      panel = undefined;
      webviewReady = false;
      conversationId = undefined;
      resetVisitedSelectionHistory();
      selectedEventId = undefined;
      conversationPinned = false;
      conversationMetadataJson = null;
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
      clearPendingSideChatGraphReference();
      syncConversationPanelOpenContext();
    });

    panel = p;
    syncConversationPanelOpenContext();
    return p;
  }

  async function toggleStarForEvent(targetEventId?: string): Promise<void> {
    const eventId = (targetEventId ?? selectedEventId)?.trim();
    if (!conversationId || !eventId) {
      void vscode.window.showWarningMessage("Colcoor: open a conversation and select a message in the tree.");
      return;
    }
    const ev = lastTreeEvents.find((e) => e.id === eventId);
    if (!ev) {
      void vscode.window.showWarningMessage(
        `Colcoor: selection not in the loaded tree — try ${COLOOR_REFRESH_CONVERSATION_TREE_PANEL_BUTTON_LABEL}.`,
      );
      return;
    }
    try {
      const nextStarred = ev.starred === true ? false : true;
      if (ev.starred === true) {
        await api.deleteStar(conversationId, eventId);
        void vscode.window.setStatusBarMessage("Colcoor: star removed.", 2000);
      } else {
        await api.putStar(conversationId, eventId);
        void vscode.window.setStatusBarMessage("Colcoor: message starred.", 2000);
      }
      lastTreeEvents = lastTreeEvents.map((e) =>
        e.id === eventId ? { ...e, starred: nextStarred } : e,
      );
      postState(lastTreeEvents, lastPostedBusy, lastPostedError, { preserveThreadScroll: true });
    } catch (e) {
      void showColcoorApiFailure(e);
    }
  }

  async function toggleStarSelectedMessage(): Promise<void> {
    await toggleStarForEvent();
  }

  async function addNoteToEvent(targetEventId?: string): Promise<void> {
    const eventId = (targetEventId ?? selectedEventId)?.trim();
    if (!conversationId || !eventId) {
      void vscode.window.showWarningMessage("Colcoor: open a conversation and select a message in the tree.");
      return;
    }
    if (!lastTreeEvents.some((e) => e.id === eventId)) {
      void vscode.window.showWarningMessage(
        `Colcoor: selection not in the loaded tree — try ${COLOOR_REFRESH_CONVERSATION_TREE_PANEL_BUTTON_LABEL}.`,
      );
      return;
    }
    const text = await vscode.window.showInputBox({
      title: "Colcoor — add note",
      prompt: "Note text (attached to this message; viewers cannot add notes).",
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
      const created = await api.createNote(conversationId, { event_id: eventId, content: noteContent });
      await incrementConversationLinearContextTokens(estimateLinearNoteTokens(created.content));
      void vscode.window.setStatusBarMessage("Colcoor: note added.", 2500);
      lastNotes = [...lastNotes, created];
      const counts = noteCountsByEventId(lastNotes);
      lastTreeEvents = lastTreeEvents.map((e) => ({
        ...e,
        note_count: counts.get(e.id) ?? 0,
      }));
      postState(lastTreeEvents, lastPostedBusy, lastPostedError, { preserveThreadScroll: true });
    } catch (e) {
      void showColcoorApiFailure(e);
    }
  }

  async function addNoteToSelectedMessage(): Promise<void> {
    await addNoteToEvent();
  }

  async function editMessageTitleForEvent(targetEventId?: string): Promise<void> {
    const eventId = (targetEventId ?? selectedEventId)?.trim();
    if (!conversationId || !eventId) {
      void vscode.window.showWarningMessage(
        "Colcoor: open a conversation and select a message in the tree.",
      );
      return;
    }
    if (!lastTreeEvents.some((e) => e.id === eventId)) {
      void vscode.window.showWarningMessage(
        `Colcoor: selection is not in the loaded tree — try ${COLOOR_REFRESH_CONVERSATION_TREE_PANEL_BUTTON_LABEL}.`,
      );
      return;
    }
    const ev = lastTreeEvents.find((e) => e.id === eventId);
    if (ev && ev.kind !== "user_input" && ev.kind !== "assistant_output") {
      void vscode.window.showWarningMessage("Colcoor: titles apply only to user or assistant messages.");
      return;
    }
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
      await api.patchEventCheckpointLabel(conversationId, eventId, payload);
      void vscode.window.setStatusBarMessage(
        payload ? "Colcoor: title saved." : "Colcoor: title cleared.",
        2500,
      );
      await loadTreeAndPush(false, null, {
        skipConversationsList: true,
        preserveLocalSelection: true,
        preserveThreadScroll: true,
      });
    } catch (e) {
      void showColcoorApiFailure(e);
    }
  }

  async function copyMessageForEvent(targetEventId: string): Promise<void> {
    const text = clipboardTextForTreeMessage(lastTreeEvents, targetEventId);
    if (text === undefined) {
      void vscode.window.showWarningMessage(
        `Colcoor: message is not in the loaded tree — try ${COLOOR_REFRESH_CONVERSATION_TREE_PANEL_BUTTON_LABEL}.`,
      );
      return;
    }
    if (text.trim().length === 0) {
      void vscode.window.showInformationMessage("Colcoor: the message has no text to copy.");
      return;
    }
    await vscode.env.clipboard.writeText(text);
    void vscode.window.setStatusBarMessage("Colcoor: message copied to clipboard.", 2500);
  }

  async function handleMessageContextAction(
    eventId: string,
    action: "copy" | "edit" | "star" | "title" | "resend" | "addNote",
  ): Promise<void> {
    const id = eventId.trim();
    if (!id || !lastTreeEvents.some((e) => e.id === id)) {
      void vscode.window.showWarningMessage(
        `Colcoor: message is not in the loaded tree — try ${COLOOR_REFRESH_CONVERSATION_TREE_PANEL_BUTTON_LABEL}.`,
      );
      return;
    }
    if (action === "copy") {
      await copyMessageForEvent(id);
      return;
    }
    if (action === "edit") {
      await handleEditUserMessage(id);
      return;
    }
    if (action === "star") {
      await toggleStarForEvent(id);
      return;
    }
    if (action === "title") {
      await editMessageTitleForEvent(id);
      return;
    }
    if (action === "resend") {
      const gate = evaluateResendAssistantGate(conversationId, id, lastTreeEvents);
      if (gate !== "ok") {
        void vscode.window.showWarningMessage(
          "Colcoor: resend only applies to a user message with text.",
        );
        return;
      }
      await handleResend(id);
      return;
    }
    if (action === "addNote") {
      await addNoteToEvent(id);
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
    const deletedEventId = selectedEventId;
    const lineageBeforeDelete = mergeEventLineageById(lastTreeEvents);
    const visibleAfterDelete = new Set(
      lastTreeEvents.filter((e) => e.id !== deletedEventId).map((e) => e.id),
    );
    const parentAfterDelete =
      lowestUndeletedAncestorId(deletedEventId, visibleAfterDelete, lineageBeforeDelete) ?? "";
    const reloadAfterSubtreeDelete = async (): Promise<void> => {
      if (staleTreePromptedForEventId === deletedEventId) {
        staleTreePromptedForEventId = null;
      }
      await loadTreeAndPush(false, null, {
        skipConversationsList: true,
        skipStaleSelectionPrompt: true,
        ...(parentAfterDelete ? { selectEventId: parentAfterDelete } : { finalizeToDefaultBranchTip: true }),
      });
      if (parentAfterDelete) {
        void syncActiveToBackend(parentAfterDelete, { needsContextRebuild: false });
      }
    };
    try {
      const out = await api.deleteEventSubtree(conversationId, deletedEventId);
      void vscode.window.setStatusBarMessage("Colcoor: message branch deleted.", 2500);
      await reloadAfterSubtreeDelete();
      if (out.deleted_count > 0 && out.deletion_group_id) {
        const undoPick = await vscode.window.showInformationMessage(
          "Colcoor: message branch deleted.",
          "Undo",
        );
        if (undoPick === "Undo") {
          try {
            await api.undoEventDeletion(conversationId, out.deletion_group_id);
            void vscode.window.setStatusBarMessage("Colcoor: deletion undone.", 2500);
            await reloadAfterSubtreeDelete();
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
        if (conversationId && selectedEventId && lastTreeEvents.some((e) => e.id === selectedEventId)) {
          rememberSelectionForConversation(conversationId, selectedEventId, lastTreeEvents);
        }
        stopInlineSideChatSse();
        inlineSideChatNotifiedMessageIds.clear();
        inlineSideChatLastNotificationAtMs = null;
        abortAllActiveMainRuns();
        clearActiveMainRuns();
        clearPendingSideChatGraphReference();
      }
      conversationId = cid;
      conversationTitle = title;
      conversationPinned = false;
      conversationMetadataJson = null;
      staleTreePromptedForEventId = null;
      staleTreePromptedForGrowthFingerprint = null;
      viewerUserIdMemo = undefined;
      resetVisitedSelectionHistory();
      selectedEventId = lastSelectedEventIdByConversation.get(cid);
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
        if (conversationId && selectedEventId && lastTreeEvents.some((e) => e.id === selectedEventId)) {
          rememberSelectionForConversation(conversationId, selectedEventId, lastTreeEvents);
        }
        stopInlineSideChatSse();
        inlineSideChatNotifiedMessageIds.clear();
        inlineSideChatLastNotificationAtMs = null;
        abortAllActiveMainRuns();
        clearActiveMainRuns();
        clearPendingSideChatGraphReference();
      }
      conversationId = cid;
      conversationTitle = title;
      conversationPinned = false;
      conversationMetadataJson = null;
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
      abortRunForSelection();
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
    async editUserMessage(): Promise<void> {
      await handleEditUserMessage();
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
      const text = clipboardTextForTreeMessage(lastTreeEvents, selectedEventId);
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
      await loadTreeAndPush(false, null, {
        preserveLocalSelection: true,
        preserveThreadScroll: true,
      });
      if (!opts?.quiet) {
        void vscode.window.setStatusBarMessage("Colcoor: conversation tree refreshed.", 2500);
      }
    },
    async openInlineSideChat(): Promise<void> {
      await openInlineSideChatDrawer();
    },
    queueSideChatGraphReferenceForNextSend(eventId: string | null, noteId: string | null): void {
      applyPendingSideChatGraphReference(eventId, noteId);
    },
    async armTryThisNextForConversation(conversationIdToArm: string): Promise<void> {
      await persistTryThisNextConversation(context.globalState, conversationIdToArm);
      if (conversationId === conversationIdToArm) {
        postState(lastTreeEvents, lastPostedBusy, lastPostedError);
      }
    },
    async previewSideChatSound(kind: "message" | "mention"): Promise<boolean> {
      if (!panel || !webviewReady) {
        return false;
      }
      if (!webviewAudioUnlocked) {
        return false;
      }
      const cue = readSideChatCueSettings(vscode.workspace.getConfiguration("colcoor"));
      try {
        await panel.webview.postMessage({
          type: "playSound",
          kind,
          volume: cue.soundVolume,
        });
        return true;
      } catch {
        return false;
      }
    },
    dispose: () => {
      subscription.dispose();
      colcoorNotesChannel.dispose();
      disposePanel();
    },
  };
}
