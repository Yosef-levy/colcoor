import { describe, expect, it } from "vitest";

import {
  CONTEXT_REBUILD_COMPOSER_BANNER,
  CONTEXT_REBUILD_SUBTITLE_SUFFIX,
} from "./contextRebuildUserCopy";

describe("contextRebuildUserCopy", () => {
  it("uses a leading space on the subtitle suffix for concatenation", () => {
    expect(CONTEXT_REBUILD_SUBTITLE_SUFFIX.startsWith(" ")).toBe(true);
    expect(CONTEXT_REBUILD_SUBTITLE_SUFFIX.trim().length).toBeGreaterThan(40);
  });

  it("mentions transcript path and notes in the composer banner", () => {
    expect(CONTEXT_REBUILD_COMPOSER_BANNER.toLowerCase()).toContain("root");
    expect(CONTEXT_REBUILD_COMPOSER_BANNER.toLowerCase()).toContain("notes");
  });
});
