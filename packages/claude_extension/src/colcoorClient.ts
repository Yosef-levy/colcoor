/**
 * HTTP client for the Colcoor backend, mirroring the patterns used in
 * packages/extension/src/api/client.ts but without any VS Code or DOM
 * dependencies so it can run inside a stock Node.js MCP server.
 *
 * The route shapes match docs/api-contracts.md (normative).
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- raw JSON helpers */

export type ColcoorClientOptions = {
  baseUrl: string;
  getAccessToken: () => string | undefined;
  /** Total request timeout (ms). Defaults to 30s. */
  timeoutMs?: number;
  /** Optional override (used by unit tests). Defaults to `globalThis.fetch`. */
  fetchImpl?: typeof fetch;
};

export type AuthResponseBody = {
  access_token: string;
  token_type?: string;
};

export type CursorExchangeBody = {
  cursor_access_token: string;
  provider_hint?: "auto" | "github" | "microsoft" | "google";
};

export type MeOut = {
  id: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
  handle?: string | null;
  access_token?: string;
};

export type MePatchBody = {
  display_name?: string;
  avatar_url?: string | null;
};

export type ConversationSummary = {
  id: string;
  title: string | null;
  pinned: boolean;
  updated_at?: string;
  side_chat_has_unread?: boolean;
  side_chat_unread_count?: number;
};

export type GraphEventNode = {
  id: string;
  conversation_id: string;
  parent_event_id: string | null;
  kind: string;
  actor_type: string;
  actor_user_id: string | null;
  content_text: string | null;
  content_json?: Record<string, unknown> | null;
  visible_to: string | null;
  created_at: string;
  updated_at: string;
  starred?: boolean;
  note_count?: number;
  checkpoint_label?: string | null;
};

export type TreeResponseBody = {
  events: GraphEventNode[];
};

export type ConversationMember = {
  user_id: string;
  role: "owner" | "editor" | "viewer";
  email?: string | null;
  display_name?: string | null;
  handle?: string | null;
};

export type MemberInviteSearchCandidate = {
  user_id: string;
  email: string;
  display_name: string | null;
  handle: string | null;
  avatar_url: string | null;
  last_login_at: string;
};

export type ConversationUserStateOut = {
  conversation_id: string;
  user_id: string;
  active_event_id: string;
  needs_context_rebuild: boolean;
  last_seen_at: string;
  side_chat_last_read_seq?: number;
};

export type AppendEventBody = {
  kind: "user_input" | "assistant_output";
  parent_event_id: string;
  content: string;
  author: string;
  private_branch?: boolean;
  content_json?: Record<string, unknown> | null;
  checkpoint_label?: string | null;
};

export type AppendEventResponse = { id: string };

export type EventSubtreeSoftDeleteOut = {
  deleted_count: number;
  deletion_group_id: string | null;
};

export type RestoreSubtreeOut = { restored_count: number };

export type NoteOut = {
  id: string;
  event_id: string;
  author_user_id: string;
  content: string;
  created_at: string;
  updated_at: string;
};

export type SideChatMessageOut = {
  id: string;
  conversation_id: string;
  seq: number;
  kind: "user" | "system_join" | "system_leave";
  author_user_id: string | null;
  author_display_name: string | null;
  author_avatar_url: string | null;
  body: string | null;
  content_json?: Record<string, unknown> | null;
  referenced_event_id: string | null;
  referenced_note_id: string | null;
  referenced_side_chat_message_id: string | null;
  created_at: string;
  updated_at: string;
  edited_at: string | null;
  deleted_at: string | null;
  deleted_by_user_id?: string | null;
  deletion_kind?: "self" | "moderator" | null;
};

export type SideChatPostBody = {
  kind: "user";
  body?: string;
  content_json?: Record<string, unknown> | null;
  referenced_event_id?: string | null;
  referenced_note_id?: string | null;
  referenced_side_chat_message_id?: string | null;
};

export type HealthOut = { status: string };

/** Custom error so callers can branch on HTTP status (401, 402, 403, 404, …). */
export class ColcoorApiHttpError extends Error {
  override readonly name = "ColcoorApiHttpError";
  readonly status: number;
  readonly operation: string;
  readonly bodyText: string;
  readonly retryAfterSeconds: number | null;

  constructor(
    operation: string,
    status: number,
    bodyText: string,
    retryAfterSeconds: number | null = null,
  ) {
    super(formatColcoorApiError(operation, status, bodyText, retryAfterSeconds));
    this.status = status;
    this.operation = operation;
    this.bodyText = bodyText;
    this.retryAfterSeconds = retryAfterSeconds;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export function isUnauthorizedColcoorApiError(e: unknown): e is ColcoorApiHttpError {
  return e instanceof ColcoorApiHttpError && e.status === 401;
}

export function parseApiErrorDetail(bodyText: string): string | undefined {
  const t = (bodyText ?? "").trim();
  if (!t) {
    return undefined;
  }
  try {
    const j = JSON.parse(t) as unknown;
    if (j && typeof j === "object") {
      const detail = (j as Record<string, unknown>).detail;
      if (typeof detail === "string" && detail.trim()) {
        return detail.trim();
      }
      if (Array.isArray(detail)) {
        const parts = detail
          .map((x) => {
            if (x && typeof x === "object") {
              const o = x as Record<string, unknown>;
              if (typeof o.msg === "string") return o.msg;
              if (typeof o.message === "string") return o.message;
            }
            return null;
          })
          .filter((s): s is string => Boolean(s));
        if (parts.length > 0) {
          return parts.join("; ");
        }
      }
    }
  } catch {
    /* not JSON */
  }
  return t.length > 280 ? `${t.slice(0, 280)}…` : t;
}

export function parseRetryAfterSeconds(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const t = raw.trim();
  if (!t) return null;
  const asNum = Number(t);
  if (Number.isFinite(asNum) && asNum >= 0) {
    return asNum;
  }
  const asDate = Date.parse(t);
  if (Number.isFinite(asDate)) {
    return Math.max(0, Math.round((asDate - Date.now()) / 1000));
  }
  return null;
}

export function formatColcoorApiError(
  operation: string,
  status: number,
  bodyText: string,
  retryAfterSeconds: number | null,
): string {
  const detail = parseApiErrorDetail(bodyText);
  if (status === 402) {
    return `Plan or usage limit — ${operation}.${detail ? ` ${detail}` : ""} Check billing or upgrade your plan.`;
  }
  let base = `${operation} failed (HTTP ${status}): ${detail ?? "(no response body)"}`;
  if (
    (status === 429 || status === 503) &&
    retryAfterSeconds != null &&
    Number.isFinite(retryAfterSeconds) &&
    retryAfterSeconds >= 0
  ) {
    base += ` Server asked to wait ${Math.floor(retryAfterSeconds)} s (Retry-After).`;
  }
  return base;
}

export class ColcoorApiClient {
  private readonly baseUrl: string;
  private readonly getAccessToken: () => string | undefined;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: ColcoorClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, "");
    this.getAccessToken = opts.getAccessToken;
    this.timeoutMs = opts.timeoutMs ?? 30_000;
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch.bind(globalThis);
  }

  /** Full API URL for a path like `/conversations` or `conversations/{id}/tree`. */
  apiUrl(path: string): string {
    const p = path.startsWith("/") ? path : `/${path}`;
    return `${this.baseUrl}/api/v1${p}`;
  }

  private async fetchInternal(
    path: string,
    init: RequestInit,
    operation: string,
    options: { auth: boolean } = { auth: true },
  ): Promise<Response> {
    const headers = new Headers(init.headers);
    if (options.auth) {
      const token = this.getAccessToken();
      if (token) {
        headers.set("Authorization", `Bearer ${token}`);
      }
    }
    const url = this.apiUrl(path);
    const ctrl = new AbortController();
    let timedOut = false;
    const tid = setTimeout(() => {
      timedOut = true;
      ctrl.abort();
    }, this.timeoutMs);
    const parent = init.signal;
    if (parent) {
      if (parent.aborted) {
        ctrl.abort();
      } else {
        parent.addEventListener("abort", () => ctrl.abort(), { once: true });
      }
    }
    try {
      return await this.fetchImpl(url, { ...init, headers, signal: ctrl.signal });
    } catch (e) {
      if (timedOut) {
        throw new Error(
          `request to ${url} timed out after ${this.timeoutMs}ms. ` +
            `Check that the Colcoor backend is reachable at ${this.baseUrl}.`,
        );
      }
      const detail = e instanceof Error ? e.message : String(e);
      throw new Error(
        `request to ${url} errored (${detail}). ` +
          `Check that the Colcoor backend is reachable at ${this.baseUrl}.`,
      );
    } finally {
      clearTimeout(tid);
    }
  }

  private async parseOrThrow<T = unknown>(res: Response, operation: string): Promise<T> {
    const text = await res.text();
    if (!res.ok) {
      const retryAfter =
        res.status === 429 || res.status === 503
          ? parseRetryAfterSeconds(res.headers.get("Retry-After"))
          : null;
      throw new ColcoorApiHttpError(operation, res.status, text, retryAfter);
    }
    if (!text) {
      return undefined as unknown as T;
    }
    try {
      return JSON.parse(text) as T;
    } catch {
      return text as unknown as T;
    }
  }

  private async expectOk(res: Response, operation: string): Promise<void> {
    if (res.ok) {
      // Drain body to free socket.
      await res.text().catch(() => "");
      return;
    }
    const text = await res.text();
    const retryAfter =
      res.status === 429 || res.status === 503
        ? parseRetryAfterSeconds(res.headers.get("Retry-After"))
        : null;
    throw new ColcoorApiHttpError(operation, res.status, text, retryAfter);
  }

  // ----- Health (no auth) -----

  async getHealth(): Promise<HealthOut> {
    const res = await this.fetchInternal("/health", { method: "GET" }, "health", { auth: false });
    return this.parseOrThrow<HealthOut>(res, "health");
  }

  // ----- Auth -----

  async cursorExchange(body: CursorExchangeBody): Promise<AuthResponseBody> {
    const res = await this.fetchInternal(
      "/auth/cursor",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cursor_access_token: body.cursor_access_token,
          provider_hint: body.provider_hint ?? "auto",
        }),
      },
      "Cursor sign-in",
      { auth: false },
    );
    return this.parseOrThrow<AuthResponseBody>(res, "Cursor sign-in");
  }

  // ----- Profile -----

  async getMe(): Promise<MeOut> {
    const res = await this.fetchInternal("/me", { method: "GET" }, "get profile");
    return this.parseOrThrow<MeOut>(res, "get profile");
  }

  async patchMe(body: MePatchBody): Promise<MeOut> {
    const res = await this.fetchInternal(
      "/me",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
      "update profile",
    );
    return this.parseOrThrow<MeOut>(res, "update profile");
  }

  // ----- Conversations -----

  async listConversations(): Promise<ConversationSummary[]> {
    const res = await this.fetchInternal("/conversations", { method: "GET" }, "list conversations");
    return this.parseOrThrow<ConversationSummary[]>(res, "list conversations");
  }

  async createConversation(body: { title?: string | null }): Promise<ConversationSummary> {
    const res = await this.fetchInternal(
      "/conversations",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: body.title ?? null }),
      },
      "create conversation",
    );
    return this.parseOrThrow<ConversationSummary>(res, "create conversation");
  }

  async patchConversation(
    conversationId: string,
    body: { title?: string | null; pinned?: boolean },
  ): Promise<ConversationSummary> {
    const res = await this.fetchInternal(
      `/conversations/${encodeURIComponent(conversationId)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
      "update conversation",
    );
    return this.parseOrThrow<ConversationSummary>(res, "update conversation");
  }

  async deleteConversation(conversationId: string): Promise<EventSubtreeSoftDeleteOut> {
    const res = await this.fetchInternal(
      `/conversations/${encodeURIComponent(conversationId)}`,
      { method: "DELETE" },
      "delete conversation",
    );
    return this.parseOrThrow<EventSubtreeSoftDeleteOut>(res, "delete conversation");
  }

  async restoreDeletedConversation(conversationId: string): Promise<RestoreSubtreeOut> {
    const res = await this.fetchInternal(
      `/conversations/${encodeURIComponent(conversationId)}/restore-deleted`,
      { method: "POST" },
      "restore deleted conversation",
    );
    return this.parseOrThrow<RestoreSubtreeOut>(res, "restore deleted conversation");
  }

  // ----- Members -----

  async listConversationMembers(conversationId: string): Promise<ConversationMember[]> {
    const res = await this.fetchInternal(
      `/conversations/${encodeURIComponent(conversationId)}/members`,
      { method: "GET" },
      "list members",
    );
    return this.parseOrThrow<ConversationMember[]>(res, "list members");
  }

  async searchConversationMemberInviteCandidates(
    conversationId: string,
    q: string,
  ): Promise<MemberInviteSearchCandidate[]> {
    const qs = new URLSearchParams({ q });
    const res = await this.fetchInternal(
      `/conversations/${encodeURIComponent(conversationId)}/member-invite-search?${qs.toString()}`,
      { method: "GET" },
      "search member invite candidates",
    );
    return this.parseOrThrow<MemberInviteSearchCandidate[]>(
      res,
      "search member invite candidates",
    );
  }

  async addConversationMember(
    conversationId: string,
    body: { user_id: string; role: "editor" | "viewer" },
  ): Promise<ConversationMember> {
    const res = await this.fetchInternal(
      `/conversations/${encodeURIComponent(conversationId)}/members`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
      "add member",
    );
    return this.parseOrThrow<ConversationMember>(res, "add member");
  }

  async patchConversationMemberRole(
    conversationId: string,
    memberUserId: string,
    body: { role: "owner" | "editor" | "viewer" },
  ): Promise<ConversationMember> {
    const res = await this.fetchInternal(
      `/conversations/${encodeURIComponent(conversationId)}/members/${encodeURIComponent(memberUserId)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: body.role }),
      },
      "update member role",
    );
    return this.parseOrThrow<ConversationMember>(res, "update member role");
  }

  async deleteConversationMember(conversationId: string, memberUserId: string): Promise<void> {
    const res = await this.fetchInternal(
      `/conversations/${encodeURIComponent(conversationId)}/members/${encodeURIComponent(memberUserId)}`,
      { method: "DELETE" },
      "remove member",
    );
    await this.expectOk(res, "remove member");
  }

  // ----- Tree / active cursor -----

  async getTree(conversationId: string): Promise<TreeResponseBody> {
    const res = await this.fetchInternal(
      `/conversations/${encodeURIComponent(conversationId)}/tree`,
      { method: "GET" },
      "load tree",
    );
    return this.parseOrThrow<TreeResponseBody>(res, "load tree");
  }

  async getCallerState(conversationId: string): Promise<ConversationUserStateOut> {
    const res = await this.fetchInternal(
      `/conversations/${encodeURIComponent(conversationId)}/caller-state`,
      { method: "GET" },
      "get caller state",
    );
    return this.parseOrThrow<ConversationUserStateOut>(res, "get caller state");
  }

  async setConversationActive(
    conversationId: string,
    body: { active_event_id: string; needs_context_rebuild?: boolean },
  ): Promise<ConversationUserStateOut> {
    const res = await this.fetchInternal(
      `/conversations/${encodeURIComponent(conversationId)}/active`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          active_event_id: body.active_event_id,
          needs_context_rebuild: body.needs_context_rebuild ?? false,
        }),
      },
      "set active node",
    );
    return this.parseOrThrow<ConversationUserStateOut>(res, "set active node");
  }

  // ----- Append events / stars / subtree -----

  async appendEvent(
    conversationId: string,
    body: AppendEventBody,
  ): Promise<AppendEventResponse> {
    const payload: Record<string, unknown> = {
      kind: body.kind,
      parent_event_id: body.parent_event_id,
      content: body.content,
      author: body.author,
      private_branch: body.private_branch ?? false,
    };
    if (body.checkpoint_label != null) {
      const t = String(body.checkpoint_label).replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
      if (t) {
        payload.checkpoint_label = t;
      }
    }
    if (body.content_json !== undefined && body.content_json !== null) {
      payload.content_json = body.content_json;
    }
    const res = await this.fetchInternal(
      `/conversations/${encodeURIComponent(conversationId)}/append-event`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
      "append event",
    );
    return this.parseOrThrow<AppendEventResponse>(res, "append event");
  }

  async putStar(conversationId: string, eventId: string): Promise<void> {
    const res = await this.fetchInternal(
      `/conversations/${encodeURIComponent(conversationId)}/events/${encodeURIComponent(eventId)}/star`,
      { method: "PUT" },
      "star event",
    );
    await this.expectOk(res, "star event");
  }

  async deleteStar(conversationId: string, eventId: string): Promise<void> {
    const res = await this.fetchInternal(
      `/conversations/${encodeURIComponent(conversationId)}/events/${encodeURIComponent(eventId)}/star`,
      { method: "DELETE" },
      "unstar event",
    );
    await this.expectOk(res, "unstar event");
  }

  async patchEventCheckpointLabel(
    conversationId: string,
    eventId: string,
    label: string | null,
  ): Promise<void> {
    const res = await this.fetchInternal(
      `/conversations/${encodeURIComponent(conversationId)}/events/${encodeURIComponent(eventId)}/checkpoint-label`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checkpoint_label: label }),
      },
      "patch event checkpoint label",
    );
    await this.expectOk(res, "patch event checkpoint label");
  }

  async deleteEventSubtree(
    conversationId: string,
    eventId: string,
  ): Promise<EventSubtreeSoftDeleteOut> {
    const res = await this.fetchInternal(
      `/conversations/${encodeURIComponent(conversationId)}/events/${encodeURIComponent(eventId)}`,
      { method: "DELETE" },
      "delete event subtree",
    );
    return this.parseOrThrow<EventSubtreeSoftDeleteOut>(res, "delete event subtree");
  }

  async undoEventDeletion(
    conversationId: string,
    deletionGroupId: string,
  ): Promise<RestoreSubtreeOut> {
    const res = await this.fetchInternal(
      `/conversations/${encodeURIComponent(conversationId)}/events/undo-delete`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deletion_group_id: deletionGroupId }),
      },
      "undo event deletion",
    );
    return this.parseOrThrow<RestoreSubtreeOut>(res, "undo event deletion");
  }

  async restoreEventSubtree(
    conversationId: string,
    eventId: string,
  ): Promise<RestoreSubtreeOut> {
    const res = await this.fetchInternal(
      `/conversations/${encodeURIComponent(conversationId)}/events/${encodeURIComponent(eventId)}/restore-subtree`,
      { method: "POST" },
      "restore event subtree",
    );
    return this.parseOrThrow<RestoreSubtreeOut>(res, "restore event subtree");
  }

  // ----- Notes -----

  async listNotes(conversationId: string): Promise<NoteOut[]> {
    const res = await this.fetchInternal(
      `/conversations/${encodeURIComponent(conversationId)}/notes`,
      { method: "GET" },
      "list notes",
    );
    return this.parseOrThrow<NoteOut[]>(res, "list notes");
  }

  async createNote(
    conversationId: string,
    body: { event_id: string; content: string },
  ): Promise<NoteOut> {
    const res = await this.fetchInternal(
      `/conversations/${encodeURIComponent(conversationId)}/notes`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
      "create note",
    );
    return this.parseOrThrow<NoteOut>(res, "create note");
  }

  async patchNote(
    conversationId: string,
    noteId: string,
    body: { content: string },
  ): Promise<NoteOut> {
    const res = await this.fetchInternal(
      `/conversations/${encodeURIComponent(conversationId)}/notes/${encodeURIComponent(noteId)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
      "update note",
    );
    return this.parseOrThrow<NoteOut>(res, "update note");
  }

  async deleteNote(conversationId: string, noteId: string): Promise<void> {
    const res = await this.fetchInternal(
      `/conversations/${encodeURIComponent(conversationId)}/notes/${encodeURIComponent(noteId)}`,
      { method: "DELETE" },
      "delete note",
    );
    await this.expectOk(res, "delete note");
  }

  // ----- Side chat -----

  async listSideChatMessages(
    conversationId: string,
    afterSeq: number = 0,
  ): Promise<SideChatMessageOut[]> {
    const q = afterSeq > 0 ? `?after_seq=${encodeURIComponent(String(afterSeq))}` : "";
    const res = await this.fetchInternal(
      `/conversations/${encodeURIComponent(conversationId)}/side-chat/messages${q}`,
      { method: "GET" },
      "list side-chat messages",
    );
    const body = await this.parseOrThrow<{ messages: SideChatMessageOut[] }>(
      res,
      "list side-chat messages",
    );
    return body.messages ?? [];
  }

  async postSideChatMessage(
    conversationId: string,
    body: SideChatPostBody,
  ): Promise<SideChatMessageOut> {
    const payload: Record<string, unknown> = {
      kind: body.kind,
      body: body.body ?? "",
    };
    if (body.content_json !== undefined) {
      payload.content_json = body.content_json;
    }
    if (body.referenced_event_id !== undefined) {
      payload.referenced_event_id = body.referenced_event_id;
    }
    if (body.referenced_note_id !== undefined) {
      payload.referenced_note_id = body.referenced_note_id;
    }
    if (body.referenced_side_chat_message_id !== undefined) {
      payload.referenced_side_chat_message_id = body.referenced_side_chat_message_id;
    }
    const res = await this.fetchInternal(
      `/conversations/${encodeURIComponent(conversationId)}/side-chat/messages`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
      "post side-chat message",
    );
    return this.parseOrThrow<SideChatMessageOut>(res, "post side-chat message");
  }

  async patchSideChatMessage(
    conversationId: string,
    messageId: string,
    body: { body: string },
  ): Promise<SideChatMessageOut> {
    const res = await this.fetchInternal(
      `/conversations/${encodeURIComponent(conversationId)}/side-chat/messages/${encodeURIComponent(messageId)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
      "patch side-chat message",
    );
    return this.parseOrThrow<SideChatMessageOut>(res, "patch side-chat message");
  }

  async deleteSideChatMessage(
    conversationId: string,
    messageId: string,
  ): Promise<SideChatMessageOut> {
    const res = await this.fetchInternal(
      `/conversations/${encodeURIComponent(conversationId)}/side-chat/messages/${encodeURIComponent(messageId)}`,
      { method: "DELETE" },
      "delete side-chat message",
    );
    return this.parseOrThrow<SideChatMessageOut>(res, "delete side-chat message");
  }

  async patchSideChatRead(conversationId: string, lastReadSeq: number): Promise<void> {
    const res = await this.fetchInternal(
      `/conversations/${encodeURIComponent(conversationId)}/side-chat/read`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ last_read_seq: lastReadSeq }),
      },
      "patch side-chat read cursor",
    );
    await this.expectOk(res, "patch side-chat read cursor");
  }
}
