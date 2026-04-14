import * as vscode from "vscode";

import type { ColcoorApiClient, GraphEventNode, MeOut, NoteOut, SideChatMessageOut } from "../api/client";
import { isPlanLimitColcoorApiError } from "../api/colcoorApiHttpError";
import { canMutateOwnSideChatUserMessage } from "./sideChatMessageActions";
import { eventIdForReferencedNote } from "./sideChatNoteReference";
import { mergeSideChatMessage } from "./mergeSideChatMessage";
import { mentionTargetsForMe } from "./sideChatMentionTargets";
import { shouldNotifyForIncomingSideChatMessage } from "./sideChatNotifyDedup";
import { shouldEmitSideChatNotificationNow } from "./sideChatNotificationRateLimit";
import { decideSideChatNotification } from "./sideChatNotifications";
import { sideChatPresenceSummary } from "./sideChatPresence";
import { shouldStartSideChatPresenceMemberRefresh } from "./sideChatPresenceMemberRefreshPolicy";
import { decideSideChatSoundKind } from "./sideChatSoundDecision";
import { maxSideChatSeq } from "./sideChatReadCursor";
import { nextSideChatReadSeqToPatch } from "./sideChatReadPatchPlan";
import { toSideChatRenderMessages, type SideChatRenderMessage } from "./sideChatRenderMessages";
import { buildSideChatSendPayload } from "./sideChatSendPayload";
import { getSideChatWebviewHtml } from "./sideChatWebviewHtml";
import { sideChatSseReconnectDelayMs } from "./sideChatSseReconnectDelay";
import { trimmedSideChatSendBody } from "./trimSendBody";
import { reportSideChatPanelApiError } from "./reportSideChatPanelApiError";
import { showColcoorApiFailure } from "../util/showColcoorApiFailure";

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
  | {
      type: "send";
      text: string;
      referencedSideChatMessageId?: string | null;
      referencedEventId?: string | null;
      referencedNoteId?: string | null;
    }
  | { type: "refresh" }
  | { type: "openConversation" }
  | { type: "openDrawers" }
  | { type: "openProfile" }
  | { type: "openSettings" }
  | { type: "openAbout" }
  | { type: "signIn" }
  | { type: "signOut" }
  | { type: "newConversation" }
  | { type: "refreshConversations" }
  | { type: "edit"; messageId: string; text: string }
  | { type: "delete"; messageId: string }
  | { type: "openReference"; refKind: "event" | "note"; refId: string };

type StateMessage = {
  type: "state";
  messages: SideChatRenderMessage[];
  /** Caller user id for author-only actions in the webview; null if profile could not be loaded. */
  viewerUserId: string | null;
  presenceSummary: string | null;
  referencedEventId: string | null;
  referencedNoteId: string | null;
};

type ErrorMessage = { type: "error"; text: string };
type PlaySoundMessage = { type: "playSound"; kind: "message" | "mention" };

/**
 * Opens a webview panel listing side-chat messages with send, refresh, and SSE updates.
 */
export async function openSideChatPanel(
  _context: vscode.ExtensionContext,
  api: ColcoorApiClient,
  conversationId: string,
  title: string | null,
  options?: { referencedEventId?: string | null; referencedNoteId?: string | null },
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
  const notifiedMessageIds = new Set<string>();
  let lastNotificationAtMs: number | null = null;
  let lastStreamSeq = 0;
  let sseStarted = false;
  /** Increments after each failed stream; reset when the stream yields an event. */
  let sseReconnectAttempt = 0;
  let disposed = false;
  /** Last `last_read_seq` successfully PATCHed (avoids spamming the API). */
  let lastPatchedReadSeq = -1;
  let readPatchChain = Promise.resolve();
  /** When updates arrive while hidden, patch read once panel is visible again. */
  let hasPendingReadPatch = false;
  /** Debounce refreshing the conversation list after read cursor updates (SSE can be chatty). */
  let listRefreshTimer: ReturnType<typeof setTimeout> | undefined;
  /** `undefined` = not loaded yet, `null` = load failed profile */
  let myProfile: MeOut | null | undefined = undefined;
  let composerReferencedEventId =
    typeof options?.referencedEventId === "string" && options.referencedEventId.trim()
      ? options.referencedEventId.trim()
      : null;
  let composerReferencedNoteId =
    typeof options?.referencedNoteId === "string" && options.referencedNoteId.trim()
      ? options.referencedNoteId.trim()
      : null;
  let eventLabelsById: Record<string, string> = {};
  let noteLabelsById: Record<string, string> = {};
  /** From `listConversationMembers` — display name or email when present; drives richer presence subtitle. */
  let memberDisplayByUserId: Record<string, string> = {};
  /** Throttle member-list refetch after join/leave SSE so presence labels can update without spamming the API. */
  let presenceMemberRefreshLastStartMs: number | null = null;
  let presenceMemberRefreshInFlight = false;
  const cfg = vscode.workspace.getConfiguration("colcoor");
  const notificationsEnabled = cfg.get<boolean>("sideChatNotificationsEnabled", true);
  const mentionNotificationsEnabled = cfg.get<boolean>("sideChatMentionNotificationsEnabled", true);
  const sideChatSoundEnabled = cfg.get<boolean>("sideChatSoundEnabled", true);
  const sideChatMentionSoundEnabled = cfg.get<boolean>("sideChatMentionSoundEnabled", true);

  async function postWebviewErrorSafe(text: string): Promise<void> {
    try {
      await panel.webview.postMessage({ type: "error", text } satisfies ErrorMessage);
    } catch {
      /* webview gone */
    }
  }

  async function reportApiErrorToSideChat(e: unknown): Promise<void> {
    await reportSideChatPanelApiError(e, {
      showHostFailure: showColcoorApiFailure,
      postWebviewError: postWebviewErrorSafe,
    });
  }

  async function ensureMyProfile(): Promise<MeOut | null> {
    if (myProfile !== undefined) {
      return myProfile;
    }
    try {
      const me = await api.getMe();
      myProfile = me;
    } catch {
      myProfile = null;
    }
    return myProfile;
  }

  function scheduleMarkRead(): void {
    readPatchChain = readPatchChain
      .then(async () => {
        if (disposed) {
          return;
        }
        const m = maxSideChatSeq(cached);
        const nextReadSeq = nextSideChatReadSeqToPatch(m, lastPatchedReadSeq, panel.visible);
        if (nextReadSeq == null) {
          if (m > lastPatchedReadSeq && !panel.visible) {
            hasPendingReadPatch = true;
          }
          return;
        }
        try {
          await api.patchSideChatRead(conversationId, nextReadSeq);
          lastPatchedReadSeq = nextReadSeq;
          hasPendingReadPatch = false;
          if (listRefreshTimer !== undefined) {
            clearTimeout(listRefreshTimer);
          }
          listRefreshTimer = setTimeout(() => {
            listRefreshTimer = undefined;
            if (!disposed) {
              void vscode.commands.executeCommand("colcoor.refreshConversations");
            }
          }, 1500);
        } catch (e) {
          if (isPlanLimitColcoorApiError(e)) {
            void showColcoorApiFailure(e);
          }
          /* ignore — badge / unread can catch up on next open */
        }
      })
      .catch(() => {
        /* never break the chain on unexpected rejection */
      });
  }

  async function postState(): Promise<void> {
    const me = await ensureMyProfile();
    const viewerUserId = me?.id ?? null;
    try {
      await panel.webview.postMessage({
        type: "state",
        messages: toSideChatRenderMessages(cached, { eventLabelsById, noteLabelsById }),
        viewerUserId,
        presenceSummary: sideChatPresenceSummary(cached, viewerUserId, memberDisplayByUserId),
        referencedEventId: composerReferencedEventId,
        referencedNoteId: composerReferencedNoteId,
      } satisfies StateMessage);
    } catch {
      /* webview gone */
    }
  }

  async function pushState(): Promise<void> {
    try {
      cached = await api.listSideChatMessages(conversationId, 0);
      lastStreamSeq = maxSideChatSeq(cached);
      for (const m of cached) {
        notifiedMessageIds.add(m.id);
      }
      await Promise.all([refreshReferenceLookups(), refreshMemberDisplayNames()]);
      await postState();
      scheduleMarkRead();
    } catch (e) {
      await reportApiErrorToSideChat(e);
    }
  }

  function shortEventLabel(ev: GraphEventNode): string {
    const t = (ev.content_text ?? "").replace(/\s+/g, " ").trim();
    return t ? t.slice(0, 32) : ev.kind;
  }

  function shortNoteLabel(n: NoteOut): string {
    const t = n.content.replace(/\s+/g, " ").trim();
    return t ? t.slice(0, 32) : "(empty note)";
  }

  async function refreshReferenceLookups(): Promise<void> {
    try {
      const [tree, notes] = await Promise.all([api.getTree(conversationId), api.listNotes(conversationId)]);
      const e: Record<string, string> = {};
      for (const ev of tree.events) {
        e[ev.id] = shortEventLabel(ev);
      }
      const n: Record<string, string> = {};
      for (const note of notes) {
        n[note.id] = shortNoteLabel(note);
      }
      eventLabelsById = e;
      noteLabelsById = n;
    } catch {
      /* keep previous lookups / fallback chips */
    }
  }

  async function refreshMemberDisplayNames(): Promise<void> {
    try {
      const members = await api.listConversationMembers(conversationId);
      const next: Record<string, string> = { ...memberDisplayByUserId };
      for (const m of members) {
        const label = (m.display_name ?? "").trim() || (m.email ?? "").trim() || "";
        next[m.user_id] = label;
      }
      memberDisplayByUserId = next;
    } catch {
      /* keep previous map — e.g. viewer without permission */
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
            const me = await ensureMyProfile();
            const soundKind = decideSideChatSoundKind({
              panelVisible: panel.visible,
              myUserId: me?.id ?? null,
              myMentionTargets: mentionTargetsForMe(me),
              incoming: o.message,
              messageSoundEnabled: sideChatSoundEnabled,
              mentionSoundEnabled: sideChatMentionSoundEnabled,
            });
            if (soundKind) {
              await panel.webview.postMessage({
                type: "playSound",
                kind: soundKind,
              } satisfies PlaySoundMessage);
            }
            if (shouldNotifyForIncomingSideChatMessage(cached, o.message, notifiedMessageIds)) {
              const notif = decideSideChatNotification({
                panelVisible: panel.visible,
                myUserId: me?.id ?? null,
                myMentionTargets: mentionTargetsForMe(me),
                incoming: o.message,
                notificationsEnabled,
                mentionNotificationsEnabled,
              });
              if (notif) {
                const nowMs = Date.now();
                if (
                  shouldEmitSideChatNotificationNow({
                    nowMs,
                    lastNotificationAtMs,
                    decision: notif,
                  })
                ) {
                  lastNotificationAtMs = nowMs;
                  void vscode.window.showInformationMessage(notif.title, {
                    detail: notif.detail,
                    modal: false,
                  });
                }
              }
            }
            notifiedMessageIds.add(o.message.id);
            cached = mergeSideChatMessage(cached, o.message);
            lastStreamSeq = Math.max(lastStreamSeq, o.message.seq);
            if (o.message.kind === "system_join" || o.message.kind === "system_leave") {
              const nowMs = Date.now();
              if (
                shouldStartSideChatPresenceMemberRefresh({
                  nowMs,
                  lastStartMs: presenceMemberRefreshLastStartMs,
                  inFlight: presenceMemberRefreshInFlight,
                })
              ) {
                presenceMemberRefreshLastStartMs = nowMs;
                presenceMemberRefreshInFlight = true;
                try {
                  await refreshMemberDisplayNames();
                } finally {
                  presenceMemberRefreshInFlight = false;
                }
              }
            }
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
    if (msg.type === "openConversation") {
      await vscode.commands.executeCommand("colcoor.openConversation", conversationId, title ?? null);
      return;
    }
    if (msg.type === "openDrawers") {
      await vscode.commands.executeCommand("colcoor.openConversationDrawers", {
        conv: { id: conversationId, title: title ?? null },
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
    if (msg.type === "signIn") {
      await vscode.commands.executeCommand("colcoor.signIn");
      return;
    }
    if (msg.type === "newConversation") {
      await vscode.commands.executeCommand("colcoor.newConversation");
      return;
    }
    if (msg.type === "signOut") {
      await vscode.commands.executeCommand("colcoor.signOut");
      return;
    }
    if (msg.type === "refreshConversations") {
      await vscode.commands.executeCommand("colcoor.refreshConversations");
      return;
    }
    if (msg.type === "send") {
      const explicitRefProvided = Object.prototype.hasOwnProperty.call(msg, "referencedEventId");
      const referencedEventId = explicitRefProvided
        ? typeof msg.referencedEventId === "string" && msg.referencedEventId.trim()
          ? msg.referencedEventId.trim()
          : null
        : composerReferencedEventId;
      const explicitNoteRefProvided = Object.prototype.hasOwnProperty.call(msg, "referencedNoteId");
      const referencedNoteId = explicitNoteRefProvided
        ? typeof msg.referencedNoteId === "string" && msg.referencedNoteId.trim()
          ? msg.referencedNoteId.trim()
          : null
        : composerReferencedNoteId;
      const payload = buildSideChatSendPayload(
        msg.text,
        msg.referencedSideChatMessageId,
        referencedEventId,
        referencedNoteId,
        cached,
      );
      if (!payload) {
        await panel.webview.postMessage({
          type: "error",
          text: "Message is empty.",
        } satisfies ErrorMessage);
        return;
      }
      try {
        await api.postSideChatMessage(conversationId, payload);
        composerReferencedEventId = null;
        composerReferencedNoteId = null;
        await pushState();
      } catch (e) {
        await reportApiErrorToSideChat(e);
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
      const uid = (await ensureMyProfile())?.id ?? null;
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
        await reportApiErrorToSideChat(e);
      }
      return;
    }
    if (msg.type === "delete") {
      const mid = typeof msg.messageId === "string" ? msg.messageId.trim() : "";
      if (!mid) {
        return;
      }
      const row = cached.find((m) => m.id === mid);
      const uid = (await ensureMyProfile())?.id ?? null;
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
        await reportApiErrorToSideChat(e);
      }
      return;
    }
    if (msg.type === "openReference") {
      const refId = typeof msg.refId === "string" ? msg.refId.trim() : "";
      if (!refId) {
        return;
      }
      if (msg.refKind === "event") {
        try {
          await api.setConversationActive(conversationId, {
            active_event_id: refId,
            needs_context_rebuild: false,
          });
          await vscode.commands.executeCommand("colcoor.openConversation", conversationId, title);
        } catch (e) {
          if (isPlanLimitColcoorApiError(e)) {
            await showColcoorApiFailure(e);
            return;
          }
          await vscode.env.clipboard.writeText(refId);
          await vscode.window.showInformationMessage(
            "Colcoor: event reference copied (could not open event directly).",
          );
        }
        return;
      }
      try {
        const notes = await api.listNotes(conversationId);
        const eventId = eventIdForReferencedNote(notes, refId);
        if (!eventId) {
          throw new Error("Referenced note is unavailable.");
        }
        await api.setConversationActive(conversationId, {
          active_event_id: eventId,
          needs_context_rebuild: false,
        });
        await vscode.commands.executeCommand("colcoor.openConversation", conversationId, title);
        await vscode.commands.executeCommand("colcoor.showNotesOnSelectedMessage");
      } catch (e) {
        if (isPlanLimitColcoorApiError(e)) {
          await showColcoorApiFailure(e);
          return;
        }
        await vscode.env.clipboard.writeText(refId);
        await vscode.window.showInformationMessage(
          "Colcoor: note reference copied (could not open note directly).",
        );
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
  panel.onDidChangeViewState(() => {
    if (!disposed && panel.visible && hasPendingReadPatch) {
      scheduleMarkRead();
    }
  });
}
