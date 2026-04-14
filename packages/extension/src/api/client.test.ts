import { afterEach, describe, expect, it, vi } from "vitest";
import { ColcoorApiClient, ColcoorApiHttpError } from "./client";

describe("ColcoorApiClient note mutations", () => {
  const origFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = origFetch;
    vi.restoreAllMocks();
  });

  it("patchNote sends PATCH with JSON body to notes subresource", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          id: "11111111-1111-4111-8111-111111111111",
          event_id: "22222222-2222-4222-8222-222222222222",
          author_user_id: "33333333-3333-4333-8333-333333333333",
          content: "updated",
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-02T00:00:00Z",
        }),
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const api = new ColcoorApiClient({
      baseUrl: "http://127.0.0.1:8000",
      getAccessToken: async () => "jwt-test",
    });
    const out = await api.patchNote("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", {
      content: "updated",
    });

    expect(out.content).toBe("updated");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/v1/conversations/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/notes/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
    expect(init.method).toBe("PATCH");
    expect(init.headers).toBeDefined();
    const h = init.headers as Headers;
    expect(h.get("Authorization")).toBe("Bearer jwt-test");
    expect(init.body).toBe(JSON.stringify({ content: "updated" }));
  });

  it("deleteNote sends DELETE and does not parse body on 204", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => "",
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const api = new ColcoorApiClient({
      baseUrl: "http://127.0.0.1:8000",
      getAccessToken: async () => "jwt-test",
    });
    await api.deleteNote("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/notes/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
    expect(init.method).toBe("DELETE");
  });

  it("getConversationCallerState sends GET to caller-state", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          conversation_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
          user_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          active_event_id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
          needs_context_rebuild: true,
          last_seen_at: "2026-01-01T12:00:00Z",
        }),
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const api = new ColcoorApiClient({
      baseUrl: "http://127.0.0.1:8000",
      getAccessToken: async () => "jwt-test",
    });
    const st = await api.getConversationCallerState("cccccccc-cccc-4ccc-8ccc-cccccccccccc");
    expect(st.needs_context_rebuild).toBe(true);
    expect(st.active_event_id).toBe("eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/conversations/cccccccc-cccc-4ccc-8ccc-cccccccccccc/caller-state");
    expect(init.method).toBe("GET");
  });

  it("patchConversationMemberRole sends PATCH to members subresource", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          user_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          role: "editor",
          email: "e@e.e",
          display_name: "E",
        }),
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const api = new ColcoorApiClient({
      baseUrl: "http://127.0.0.1:8000",
      getAccessToken: async () => "jwt-test",
    });
    const out = await api.patchConversationMemberRole(
      "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      { role: "editor" },
    );
    expect(out.role).toBe("editor");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain(
      "/conversations/cccccccc-cccc-4ccc-8ccc-cccccccccccc/members/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    );
    expect(init.method).toBe("PATCH");
    expect(init.body).toBe(JSON.stringify({ role: "editor" }));
  });

  it("deleteConversationMember sends DELETE", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => "" });
    globalThis.fetch = fetchMock as typeof fetch;

    const api = new ColcoorApiClient({
      baseUrl: "http://127.0.0.1:8000",
      getAccessToken: async () => "jwt-test",
    });
    await api.deleteConversationMember(
      "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    );
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain(
      "/conversations/cccccccc-cccc-4ccc-8ccc-cccccccccccc/members/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    );
    expect(init.method).toBe("DELETE");
  });

  it("postConversationMember sends POST with user_id and role", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          user_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          role: "viewer",
          email: "v@v.v",
          display_name: "V",
        }),
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const api = new ColcoorApiClient({
      baseUrl: "http://127.0.0.1:8000",
      getAccessToken: async () => "jwt-test",
    });
    const out = await api.postConversationMember("cccccccc-cccc-4ccc-8ccc-cccccccccccc", {
      user_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      role: "viewer",
    });
    expect(out.role).toBe("viewer");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/conversations/cccccccc-cccc-4ccc-8ccc-cccccccccccc/members");
    expect(init.method).toBe("POST");
    expect(init.body).toBe(
      JSON.stringify({ user_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", role: "viewer" }),
    );
  });

  it("patchNote throws with server detail on failure", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      statusText: "Forbidden",
      text: async () => JSON.stringify({ detail: "forbidden" }),
    }) as typeof fetch;

    const api = new ColcoorApiClient({
      baseUrl: "http://127.0.0.1:8000",
      getAccessToken: async () => "jwt-test",
    });
    await expect(
      api.patchNote("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", {
        content: "x",
      }),
    ).rejects.toThrow(/update note failed \(HTTP 403\).*forbidden/);
  });

  it("patchSideChatMessage sends PATCH to message id with body", async () => {
    const out = {
      id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      conversation_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      seq: 2,
      kind: "user",
      author_user_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      body: "hi",
      referenced_event_id: null,
      referenced_note_id: null,
      referenced_side_chat_message_id: null,
      created_at: "t",
      updated_at: "t",
      edited_at: null,
      deleted_at: null,
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(out),
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const api = new ColcoorApiClient({
      baseUrl: "http://127.0.0.1:8000",
      getAccessToken: async () => "jwt-test",
    });
    const row = await api.patchSideChatMessage(
      "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      { body: "hi" },
    );
    expect(row.body).toBe("hi");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain(
      "/conversations/cccccccc-cccc-4ccc-8ccc-cccccccccccc/side-chat/messages/dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    );
    expect(init.method).toBe("PATCH");
    expect(init.body).toBe(JSON.stringify({ body: "hi" }));
  });

  it("deleteSideChatMessage sends DELETE to message id", async () => {
    const out = {
      id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      conversation_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      seq: 2,
      kind: "user",
      author_user_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      body: "x",
      referenced_event_id: null,
      referenced_note_id: null,
      referenced_side_chat_message_id: null,
      created_at: "t",
      updated_at: "t",
      edited_at: null,
      deleted_at: "2026-01-01T00:00:00Z",
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(out),
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const api = new ColcoorApiClient({
      baseUrl: "http://127.0.0.1:8000",
      getAccessToken: async () => "jwt-test",
    });
    const row = await api.deleteSideChatMessage(
      "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    );
    expect(row.deleted_at).toBe("2026-01-01T00:00:00Z");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain(
      "/conversations/cccccccc-cccc-4ccc-8ccc-cccccccccccc/side-chat/messages/dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    );
    expect(init.method).toBe("DELETE");
  });

  it("patchSideChatRead sends PATCH with last_read_seq and accepts 204", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
      text: async () => "",
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const api = new ColcoorApiClient({
      baseUrl: "http://127.0.0.1:8000",
      getAccessToken: async () => "jwt-test",
    });
    await api.patchSideChatRead("cccccccc-cccc-4ccc-8ccc-cccccccccccc", 7);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/conversations/cccccccc-cccc-4ccc-8ccc-cccccccccccc/side-chat/read");
    expect(init.method).toBe("PATCH");
    expect(init.body).toBe(JSON.stringify({ last_read_seq: 7 }));
  });

  it("listSideChatMessages uses after_seq query when > 0", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ messages: [] }),
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const api = new ColcoorApiClient({
      baseUrl: "http://127.0.0.1:8000",
      getAccessToken: async () => "jwt-test",
    });
    await api.listSideChatMessages("cccccccc-cccc-4ccc-8ccc-cccccccccccc", 42);
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/side-chat/messages?after_seq=42");
  });

  it("listConversations parses side_chat unread fields", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify([
          {
            id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
            title: "T",
            pinned: false,
            updated_at: "2026-01-01T00:00:00Z",
            side_chat_has_unread: true,
            side_chat_unread_count: 2,
          },
        ]),
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const api = new ColcoorApiClient({
      baseUrl: "http://127.0.0.1:8000",
      getAccessToken: async () => "jwt-test",
    });
    const rows = await api.listConversations();
    expect(rows).toHaveLength(1);
    expect(rows[0].side_chat_has_unread).toBe(true);
    expect(rows[0].side_chat_unread_count).toBe(2);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/v1/conversations");
    expect(init.method).toBe("GET");
  });

  it("getMe sends GET /api/v1/me", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          email: "e@e.e",
          display_name: "X",
          avatar_url: null,
        }),
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const api = new ColcoorApiClient({
      baseUrl: "http://127.0.0.1:8000",
      getAccessToken: async () => "jwt-test",
    });
    const me = await api.getMe();
    expect(me.email).toBe("e@e.e");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/v1/me");
    expect(init.method).toBe("GET");
  });

  it("streamSideChatSseEvents yields parsed data from streaming body", async () => {
    const encoder = new TextEncoder();
    const sse = 'data: {"type":"side_chat","message":{"seq":1}}\n\n';
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(sse));
        controller.close();
      },
    });
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(stream, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      }),
    );

    const api = new ColcoorApiClient({
      baseUrl: "http://127.0.0.1:8000",
      getAccessToken: async () => "jwt-test",
    });
    const gen = api.streamSideChatSseEvents("cccccccc-cccc-4ccc-8ccc-cccccccccccc");
    const first = await gen.next();
    expect(first.done).toBe(false);
    expect(first.value).toEqual({ type: "side_chat", message: { seq: 1 } });
    const end = await gen.next();
    expect(end.done).toBe(true);
    const [url] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/side-chat/stream");
  });

  it("patchMe sends PATCH /api/v1/me with JSON body", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          email: "u@u.u",
          display_name: "Sam",
          avatar_url: null,
        }),
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const api = new ColcoorApiClient({
      baseUrl: "http://127.0.0.1:8000",
      getAccessToken: async () => "jwt-test",
    });
    const out = await api.patchMe({ display_name: "Sam" });
    expect(out.display_name).toBe("Sam");
    expect(out.email).toBe("u@u.u");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/v1/me");
    expect(init.method).toBe("PATCH");
    expect(init.body).toBe(JSON.stringify({ display_name: "Sam" }));
  });

  it("createConversation surfaces HTTP 402 as plan / usage wording", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 402,
      statusText: "Payment Required",
      text: async () => JSON.stringify({ detail: "event quota exceeded" }),
    }) as typeof fetch;

    const api = new ColcoorApiClient({
      baseUrl: "http://127.0.0.1:8000",
      getAccessToken: async () => "jwt-test",
    });
    try {
      await api.createConversation({ title: "x" });
      expect.fail("expected rejection");
    } catch (e) {
      expect(e).toBeInstanceOf(ColcoorApiHttpError);
      expect((e as ColcoorApiHttpError).status).toBe(402);
      expect((e as Error).message).toMatch(
        /Plan or usage limit.*create conversation.*event quota exceeded/s,
      );
    }
  });
});
