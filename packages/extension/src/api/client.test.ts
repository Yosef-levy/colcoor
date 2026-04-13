import { afterEach, describe, expect, it, vi } from "vitest";
import { ColcoorApiClient } from "./client";

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
    await expect(api.createConversation({ title: "x" })).rejects.toThrow(
      /Plan or usage limit.*create conversation.*event quota exceeded/s,
    );
  });
});
