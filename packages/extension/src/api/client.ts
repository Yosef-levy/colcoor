import { formatColcoorApiError } from "./apiErrorFormatting";
import { parseCompleteSseDataJsonBlocks } from "./sideChatSseParse";

export type ColcoorApiClientOptions = {
  baseUrl: string;
  getAccessToken: () => Promise<string | undefined>;
};

export type AuthResponseBody = {
  access_token: string;
};

export type CursorExchangeBody = {
  cursor_access_token: string;
  provider_hint?: "auto" | "github" | "microsoft" | "google";
};

export type ConversationSummary = {
  id: string;
  title: string | null;
  pinned: boolean;
  /** ISO 8601; used for sidebar ordering and “last updated”. */
  updated_at?: string;
};

export type GraphEventNode = {
  id: string;
  conversation_id: string;
  parent_event_id: string | null;
  kind: string;
  actor_type: string;
  actor_user_id: string | null;
  content_text: string | null;
  /** Cursor CLI stream-json timeline envelope (`colcoor_agent_trace`), when present. */
  content_json?: Record<string, unknown> | null;
  visible_to: string | null;
  created_at: string;
  updated_at: string;
  /** Tree API: whether the current user starred this event. */
  starred?: boolean;
  /** Tree API: note count on this event. */
  note_count?: number;
};

export type TreeResponseBody = {
  events: GraphEventNode[];
};

export type ConversationMember = {
  user_id: string;
  role: "owner" | "editor" | "viewer";
  email?: string | null;
  display_name?: string | null;
};

export type SetConversationActiveBody = {
  active_event_id: string;
  needs_context_rebuild?: boolean;
};

export type ConversationUserStateOut = {
  conversation_id: string;
  user_id: string;
  active_event_id: string;
  needs_context_rebuild: boolean;
  last_seen_at: string;
};

export type AppendEventBody = {
  kind: "user_input" | "assistant_output";
  parent_event_id: string;
  content: string;
  author: string;
  private_branch?: boolean;
  content_json?: Record<string, unknown>;
};

export type AppendEventResponse = {
  id: string;
};

export type NoteOut = {
  id: string;
  event_id: string;
  author_user_id: string;
  content: string;
  created_at: string;
  updated_at: string;
};

/** GET/PATCH …/me response (api-contracts §9.1). */
export type MeOut = {
  id: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
  access_token?: string;
};

export type MePatchBody = {
  display_name?: string;
  avatar_url?: string | null;
};

/** Side-chat row (api-contracts §10). */
export type SideChatMessageOut = {
  id: string;
  conversation_id: string;
  seq: number;
  kind: "user" | "system_join" | "system_leave";
  author_user_id: string | null;
  body: string | null;
  referenced_event_id: string | null;
  referenced_note_id: string | null;
  referenced_side_chat_message_id: string | null;
  created_at: string;
  updated_at: string;
  edited_at: string | null;
  deleted_at: string | null;
};

export type SideChatPostBody = {
  kind: "user";
  body: string;
  referenced_event_id?: string | null;
  referenced_note_id?: string | null;
  referenced_side_chat_message_id?: string | null;
};

/**
 * HTTP client for the extension-dedicated backend.
 * Authenticated requests send Authorization (docs/monetization.md).
 */
function networkErrorDetail(url: string, err: unknown): string {
  const hint =
    "Check that the API is running, Settings → Colcoor → backend base URL matches " +
    "(e.g. http://127.0.0.1 for Docker nginx on port 80, or http://127.0.0.1:8000 for local uvicorn).";
  if (!(err instanceof Error)) {
    return `Request to ${url} failed: ${String(err)}. ${hint}`;
  }
  const cause = "cause" in err && err.cause instanceof Error ? err.cause.message : "";
  const parts = [err.message, cause].filter(Boolean).join(" — ");
  return `Request to ${url} failed (${parts}). ${hint}`;
}

export class ColcoorApiClient {
  private readonly baseUrl: string;
  private readonly getAccessToken: () => Promise<string | undefined>;

  constructor(options: ColcoorApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.getAccessToken = options.getAccessToken;
  }

  private apiUrl(path: string): string {
    const p = path.startsWith("/") ? path : `/${path}`;
    return `${this.baseUrl}/api/v1${p}`;
  }

  private assertOkResponse(res: Response, bodyText: string, operation: string): void {
    if (res.ok) {
      return;
    }
    throw new Error(formatColcoorApiError(operation, res.status, bodyText));
  }

  private async fetchOrThrow(url: string, init: RequestInit): Promise<Response> {
    try {
      return await fetch(url, init);
    } catch (e) {
      throw new Error(networkErrorDetail(url, e));
    }
  }

  /**
   * Authenticated GET without the default 30s abort (for SSE and other long streams).
   * Pass `signal` to cancel.
   */
  private async fetchStreamingUnbuffered(
    path: string,
    init: RequestInit = {},
  ): Promise<Response> {
    const token = await this.getAccessToken();
    const headers = new Headers(init.headers);
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
    const url = this.apiUrl(path);
    return await this.fetchOrThrow(url, { ...init, headers });
  }

  /** GET /me — caller profile (same shape as PATCH …/me). */
  async getMe(): Promise<MeOut> {
    const res = await this.fetchApi("/me", { method: "GET" });
    const text = await res.text();
    this.assertOkResponse(res, text, "get profile");
    return JSON.parse(text) as MeOut;
  }

  /** PATCH /me — update caller display name and/or avatar URL. */
  async patchMe(body: MePatchBody): Promise<MeOut> {
    const res = await this.fetchApi("/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    this.assertOkResponse(res, text, "update profile");
    return JSON.parse(text) as MeOut;
  }

  async fetchApi(path: string, init: RequestInit = {}): Promise<Response> {
    const token = await this.getAccessToken();
    const headers = new Headers(init.headers);
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
    const url = this.apiUrl(path);
    const timeoutMs = 30_000;
    const ctrl = new AbortController();
    let timedOut = false;
    const tid = setTimeout(() => {
      timedOut = true;
      ctrl.abort();
    }, timeoutMs);
    const parent = init.signal;
    if (parent) {
      if (parent.aborted) {
        ctrl.abort();
      } else {
        parent.addEventListener("abort", () => ctrl.abort(), { once: true });
      }
    }
    try {
      return await this.fetchOrThrow(url, { ...init, headers, signal: ctrl.signal });
    } catch (e) {
      if (timedOut) {
        throw new Error(networkErrorDetail(url, new Error(`timed out after ${timeoutMs}ms`)));
      }
      throw e;
    } finally {
      clearTimeout(tid);
    }
  }

  /** Production: exchange VS Code / Cursor IdP token for Colcoor API JWT. */
  async cursorExchange(body: CursorExchangeBody): Promise<AuthResponseBody> {
    const url = this.apiUrl("/auth/cursor");
    const res = await this.fetchOrThrow(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cursor_access_token: body.cursor_access_token,
        provider_hint: body.provider_hint ?? "auto",
      }),
    });
    const text = await res.text();
    this.assertOkResponse(res, text, "Cursor sign-in");
    return JSON.parse(text) as AuthResponseBody;
  }

  async listConversations(): Promise<ConversationSummary[]> {
    const res = await this.fetchApi("/conversations", { method: "GET" });
    const text = await res.text();
    this.assertOkResponse(res, text, "list conversations");
    return JSON.parse(text) as ConversationSummary[];
  }

  /** Create a conversation; you are the owner (POST /conversations). */
  async createConversation(body: { title?: string | null }): Promise<ConversationSummary> {
    const res = await this.fetchApi("/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: body.title ?? null }),
    });
    const text = await res.text();
    this.assertOkResponse(res, text, "create conversation");
    return JSON.parse(text) as ConversationSummary;
  }

  /** Update title (owner/editor) and/or caller pin state (PATCH /conversations/{id}). */
  async patchConversation(
    conversationId: string,
    body: { title?: string | null; pinned?: boolean },
  ): Promise<ConversationSummary> {
    const res = await this.fetchApi(`/conversations/${conversationId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    this.assertOkResponse(res, text, "update conversation");
    return JSON.parse(text) as ConversationSummary;
  }

  async getTree(conversationId: string): Promise<TreeResponseBody> {
    const res = await this.fetchApi(`/conversations/${conversationId}/tree`, { method: "GET" });
    const text = await res.text();
    this.assertOkResponse(res, text, "load tree");
    return JSON.parse(text) as TreeResponseBody;
  }

  /** List members (owner, editor, viewer); caller must be a member. */
  async listConversationMembers(conversationId: string): Promise<ConversationMember[]> {
    const res = await this.fetchApi(`/conversations/${conversationId}/members`, { method: "GET" });
    const text = await res.text();
    this.assertOkResponse(res, text, "list members");
    return JSON.parse(text) as ConversationMember[];
  }

  /** Add a member (owner or editor per server); 409 if already a member. */
  async postConversationMember(
    conversationId: string,
    body: { user_id: string; role: "editor" | "viewer" },
  ): Promise<ConversationMember> {
    const res = await this.fetchApi(`/conversations/${conversationId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    this.assertOkResponse(res, text, "add member");
    return JSON.parse(text) as ConversationMember;
  }

  /** Change a member’s role (owner only on server). */
  async patchConversationMemberRole(
    conversationId: string,
    memberUserId: string,
    body: { role: "owner" | "editor" | "viewer" },
  ): Promise<ConversationMember> {
    const res = await this.fetchApi(`/conversations/${conversationId}/members/${memberUserId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: body.role }),
    });
    const text = await res.text();
    this.assertOkResponse(res, text, "update member role");
    return JSON.parse(text) as ConversationMember;
  }

  /** Remove a non-owner member (owner only on server). */
  async deleteConversationMember(conversationId: string, memberUserId: string): Promise<void> {
    const res = await this.fetchApi(`/conversations/${conversationId}/members/${memberUserId}`, {
      method: "DELETE",
    });
    const t = await res.text();
    this.assertOkResponse(res, t, "remove member");
  }

  /** Read the caller’s active node and rebuild flag (GET …/caller-state). */
  async getConversationCallerState(conversationId: string): Promise<ConversationUserStateOut> {
    const res = await this.fetchApi(`/conversations/${conversationId}/caller-state`, {
      method: "GET",
    });
    const text = await res.text();
    this.assertOkResponse(res, text, "get caller state");
    return JSON.parse(text) as ConversationUserStateOut;
  }

  /** Persist the caller’s active tree node (POST …/active). */
  async setConversationActive(
    conversationId: string,
    body: SetConversationActiveBody,
  ): Promise<ConversationUserStateOut> {
    const res = await this.fetchApi(`/conversations/${conversationId}/active`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        active_event_id: body.active_event_id,
        needs_context_rebuild: body.needs_context_rebuild ?? false,
      }),
    });
    const text = await res.text();
    this.assertOkResponse(res, text, "set active node");
    return JSON.parse(text) as ConversationUserStateOut;
  }

  /** Star an event (idempotent PUT …/events/{id}/star). */
  async putStar(conversationId: string, eventId: string): Promise<void> {
    const res = await this.fetchApi(`/conversations/${conversationId}/events/${eventId}/star`, {
      method: "PUT",
    });
    const text = await res.text();
    this.assertOkResponse(res, text, "star message");
  }

  /** Remove star (DELETE …/events/{id}/star). */
  async deleteStar(conversationId: string, eventId: string): Promise<void> {
    const res = await this.fetchApi(`/conversations/${conversationId}/events/${eventId}/star`, {
      method: "DELETE",
    });
    const text = await res.text();
    this.assertOkResponse(res, text, "unstar message");
  }

  async listNotes(conversationId: string): Promise<NoteOut[]> {
    const res = await this.fetchApi(`/conversations/${conversationId}/notes`, { method: "GET" });
    const text = await res.text();
    this.assertOkResponse(res, text, "list notes");
    return JSON.parse(text) as NoteOut[];
  }

  async createNote(conversationId: string, body: { event_id: string; content: string }): Promise<NoteOut> {
    const res = await this.fetchApi(`/conversations/${conversationId}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    this.assertOkResponse(res, text, "create note");
    return JSON.parse(text) as NoteOut;
  }

  async patchNote(
    conversationId: string,
    noteId: string,
    body: { content: string },
  ): Promise<NoteOut> {
    const res = await this.fetchApi(`/conversations/${conversationId}/notes/${noteId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: body.content }),
    });
    const text = await res.text();
    this.assertOkResponse(res, text, "update note");
    return JSON.parse(text) as NoteOut;
  }

  async deleteNote(conversationId: string, noteId: string): Promise<void> {
    const res = await this.fetchApi(`/conversations/${conversationId}/notes/${noteId}`, {
      method: "DELETE",
    });
    const t = await res.text();
    this.assertOkResponse(res, t, "delete note");
  }

  /** Owner-only: delete conversation and cascaded data (DELETE /conversations/{id}). */
  async deleteConversation(conversationId: string): Promise<void> {
    const res = await this.fetchApi(`/conversations/${conversationId}`, { method: "DELETE" });
    const text = await res.text();
    this.assertOkResponse(res, text, "delete conversation");
  }

  /** GET …/side-chat/messages (`after_seq` defaults to 0). */
  async listSideChatMessages(
    conversationId: string,
    afterSeq: number = 0,
  ): Promise<SideChatMessageOut[]> {
    const q = afterSeq > 0 ? `?after_seq=${encodeURIComponent(String(afterSeq))}` : "";
    const res = await this.fetchApi(
      `/conversations/${conversationId}/side-chat/messages${q}`,
      { method: "GET" },
    );
    const text = await res.text();
    this.assertOkResponse(res, text, "list side-chat messages");
    const j = JSON.parse(text) as { messages: SideChatMessageOut[] };
    return j.messages;
  }

  async postSideChatMessage(
    conversationId: string,
    body: SideChatPostBody,
  ): Promise<SideChatMessageOut> {
    const res = await this.fetchApi(`/conversations/${conversationId}/side-chat/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    this.assertOkResponse(res, text, "post side-chat message");
    return JSON.parse(text) as SideChatMessageOut;
  }

  async patchSideChatMessage(
    conversationId: string,
    messageId: string,
    body: { body: string },
  ): Promise<SideChatMessageOut> {
    const res = await this.fetchApi(
      `/conversations/${conversationId}/side-chat/messages/${messageId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    const text = await res.text();
    this.assertOkResponse(res, text, "patch side-chat message");
    return JSON.parse(text) as SideChatMessageOut;
  }

  async deleteSideChatMessage(
    conversationId: string,
    messageId: string,
  ): Promise<SideChatMessageOut> {
    const res = await this.fetchApi(
      `/conversations/${conversationId}/side-chat/messages/${messageId}`,
      { method: "DELETE" },
    );
    const text = await res.text();
    this.assertOkResponse(res, text, "delete side-chat message");
    return JSON.parse(text) as SideChatMessageOut;
  }

  async patchSideChatRead(conversationId: string, lastReadSeq: number): Promise<void> {
    const res = await this.fetchApi(`/conversations/${conversationId}/side-chat/read`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ last_read_seq: lastReadSeq }),
    });
    const text = await res.text();
    this.assertOkResponse(res, text, "patch side-chat read cursor");
  }

  /**
   * Consume GET …/side-chat/stream (SSE). Yields one parsed JSON object per complete `data:` event.
   * Uses streaming fetch (no 30s `fetchApi` timeout); cancel with `signal`.
   */
  async *streamSideChatSseEvents(
    conversationId: string,
    options?: { afterSeq?: number; signal?: AbortSignal },
  ): AsyncGenerator<unknown, void, unknown> {
    const q =
      options?.afterSeq !== undefined && options.afterSeq > 0
        ? `?after_seq=${encodeURIComponent(String(options.afterSeq))}`
        : "";
    const res = await this.fetchStreamingUnbuffered(
      `/conversations/${conversationId}/side-chat/stream${q}`,
      {
        method: "GET",
        headers: { Accept: "text/event-stream" },
        signal: options?.signal,
      },
    );
    if (!res.ok) {
      const errBody = await res.text();
      this.assertOkResponse(res, errBody, "side-chat stream");
      return;
    }
    const reader = res.body?.getReader();
    if (reader == null) {
      throw new Error("side-chat stream: response has no body");
    }
    const dec = new TextDecoder();
    let buf = "";
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (value) {
          buf += dec.decode(value, { stream: true });
        }
        const parsed = parseCompleteSseDataJsonBlocks(buf);
        buf = parsed.rest;
        for (const p of parsed.payloads) {
          try {
            yield JSON.parse(p) as unknown;
          } catch {
            /* ignore malformed JSON */
          }
        }
        if (done) {
          buf += dec.decode();
          const tail = parseCompleteSseDataJsonBlocks(buf);
          for (const p of tail.payloads) {
            try {
              yield JSON.parse(p) as unknown;
            } catch {
              /* ignore */
            }
          }
          break;
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  async appendEvent(conversationId: string, body: AppendEventBody): Promise<AppendEventResponse> {
    const payload: Record<string, unknown> = {
      kind: body.kind,
      parent_event_id: body.parent_event_id,
      content: body.content,
      author: body.author,
      private_branch: body.private_branch ?? false,
    };
    if (body.content_json !== undefined) {
      payload.content_json = body.content_json;
    }
    const res = await this.fetchApi(`/conversations/${conversationId}/append-event`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    this.assertOkResponse(res, text, "append event");
    return JSON.parse(text) as AppendEventResponse;
  }
}
