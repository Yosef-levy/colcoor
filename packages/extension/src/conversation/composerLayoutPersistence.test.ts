import { describe, expect, it } from "vitest";
import {
  COMPOSER_TEXTAREA_MAX_PX,
  COMPOSER_TEXTAREA_MIN_PX,
  clampComposerTextareaHeightPx,
} from "./composerLayoutPersistence";

describe("clampComposerTextareaHeightPx", () => {
  it("returns null for non-numeric or non-finite values", () => {
    expect(clampComposerTextareaHeightPx(undefined)).toBeNull();
    expect(clampComposerTextareaHeightPx(null)).toBeNull();
    expect(clampComposerTextareaHeightPx("120")).toBeNull();
    expect(clampComposerTextareaHeightPx(NaN)).toBeNull();
    expect(clampComposerTextareaHeightPx(Infinity)).toBeNull();
  });

  it("returns null below min or above max", () => {
    expect(clampComposerTextareaHeightPx(COMPOSER_TEXTAREA_MIN_PX - 1)).toBeNull();
    expect(clampComposerTextareaHeightPx(COMPOSER_TEXTAREA_MAX_PX + 1)).toBeNull();
  });

  it("floors and accepts inclusive bounds", () => {
    expect(clampComposerTextareaHeightPx(COMPOSER_TEXTAREA_MIN_PX)).toBe(COMPOSER_TEXTAREA_MIN_PX);
    expect(clampComposerTextareaHeightPx(COMPOSER_TEXTAREA_MAX_PX)).toBe(COMPOSER_TEXTAREA_MAX_PX);
    expect(clampComposerTextareaHeightPx(100.7)).toBe(100);
  });
});
