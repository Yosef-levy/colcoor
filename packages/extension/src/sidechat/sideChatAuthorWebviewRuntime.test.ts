import { describe, expect, it } from "vitest";

import { SIDECHAT_AUTHOR_WEBVIEW_JS } from "./sideChatAuthorWebviewRuntime";

describe("SIDECHAT_AUTHOR_WEBVIEW_JS", () => {
  it("accepts only https avatar URLs", () => {
    expect(
      new Function(`${SIDECHAT_AUTHOR_WEBVIEW_JS}; return sideChatHttpsAvatarUrl("https://cdn/x.png");`)(),
    ).toBe("https://cdn/x.png");
    expect(
      new Function(`${SIDECHAT_AUTHOR_WEBVIEW_JS}; return sideChatHttpsAvatarUrl("http://insecure/x.png");`)(),
    ).toBe(null);
    expect(
      new Function(
        `${SIDECHAT_AUTHOR_WEBVIEW_JS}; return sideChatHttpsAvatarUrl("javascript:alert(1)");`,
      )(),
    ).toBe(null);
    expect(new Function(`${SIDECHAT_AUTHOR_WEBVIEW_JS}; return sideChatHttpsAvatarUrl(null);`)()).toBe(null);
  });

  it("builds meta base and author suffix", () => {
    const code = `${SIDECHAT_AUTHOR_WEBVIEW_JS}
      var m = { seq: 3, kind: "user", deleted_at: null, author_display_name: "Pat", author_user_id: "u1" };
      return sideChatMetaBase(m) + sideChatAuthorSuffix(m);
    `;
    expect(new Function(code)()).toBe("user · Pat");
  });

  it("uses Member fallback when display name missing but author id present", () => {
    const code = `${SIDECHAT_AUTHOR_WEBVIEW_JS}
      var m = { seq: 1, kind: "user", deleted_at: null, author_display_name: null, author_user_id: "x" };
      return sideChatAuthorSuffix(m);
    `;
    expect(new Function(code)()).toBe(" · Member");
  });

  it("no suffix for system lines without author", () => {
    const code = `${SIDECHAT_AUTHOR_WEBVIEW_JS}
      var m = { seq: 2, kind: "system_join", deleted_at: null, author_display_name: null, author_user_id: null };
      return sideChatAuthorSuffix(m);
    `;
    expect(new Function(code)()).toBe("");
  });
});
