import { describe, expect, it } from "vitest";

import {
  SIDECHAT_COMPOSER_TEXTAREA_MAX_PX,
  SIDECHAT_COMPOSER_TEXTAREA_MIN_PX,
  clampSideChatComposerTextareaHeightPx,
} from "./sideChatComposerLayoutPersistence";

describe("clampSideChatComposerTextareaHeightPx", () => {
  it("returns null for non-finite values", () => {
    expect(clampSideChatComposerTextareaHeightPx(undefined)).toBeNull();
    expect(clampSideChatComposerTextareaHeightPx("90")).toBeNull();
    expect(clampSideChatComposerTextareaHeightPx(NaN)).toBeNull();
  });

  it("returns null outside 64–520", () => {
    expect(clampSideChatComposerTextareaHeightPx(SIDECHAT_COMPOSER_TEXTAREA_MIN_PX - 1)).toBeNull();
    expect(clampSideChatComposerTextareaHeightPx(SIDECHAT_COMPOSER_TEXTAREA_MAX_PX + 1)).toBeNull();
  });

  it("accepts bounds and floors fractional values", () => {
    expect(clampSideChatComposerTextareaHeightPx(SIDECHAT_COMPOSER_TEXTAREA_MIN_PX)).toBe(
      SIDECHAT_COMPOSER_TEXTAREA_MIN_PX,
    );
    expect(clampSideChatComposerTextareaHeightPx(SIDECHAT_COMPOSER_TEXTAREA_MAX_PX)).toBe(
      SIDECHAT_COMPOSER_TEXTAREA_MAX_PX,
    );
    expect(clampSideChatComposerTextareaHeightPx(120.7)).toBe(120);
  });
});
