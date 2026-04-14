import { describe, expect, it } from "vitest";

import {
  SIDECHAT_VIEW_COLUMN_ACTIVE,
  SIDECHAT_VIEW_COLUMN_BESIDE,
  viewColumnValueForSideChatOpenTarget,
} from "./sideChatOpenViewColumn";

describe("viewColumnValueForSideChatOpenTarget", () => {
  it("defaults to beside", () => {
    expect(viewColumnValueForSideChatOpenTarget(undefined)).toBe(SIDECHAT_VIEW_COLUMN_BESIDE);
    expect(viewColumnValueForSideChatOpenTarget("")).toBe(SIDECHAT_VIEW_COLUMN_BESIDE);
  });

  it("accepts beside with trimming and case", () => {
    expect(viewColumnValueForSideChatOpenTarget("beside")).toBe(SIDECHAT_VIEW_COLUMN_BESIDE);
    expect(viewColumnValueForSideChatOpenTarget("  BESIDE  ")).toBe(SIDECHAT_VIEW_COLUMN_BESIDE);
  });

  it("maps active to the active editor column", () => {
    expect(viewColumnValueForSideChatOpenTarget("active")).toBe(SIDECHAT_VIEW_COLUMN_ACTIVE);
    expect(viewColumnValueForSideChatOpenTarget("  Active ")).toBe(SIDECHAT_VIEW_COLUMN_ACTIVE);
  });

  it("falls back to beside for unknown values", () => {
    expect(viewColumnValueForSideChatOpenTarget("panel")).toBe(SIDECHAT_VIEW_COLUMN_BESIDE);
  });
});
