import { describe, expect, it } from "vitest";

import { pendingUserHtmlForPanelState } from "./pendingUserHtmlForPanelState";

describe("pendingUserHtmlForPanelState", () => {
  it("returns null when not busy", () => {
    expect(pendingUserHtmlForPanelState(false, "hello")).toBeNull();
  });

  it("returns null when busy but no pending markdown", () => {
    expect(pendingUserHtmlForPanelState(true, undefined)).toBeNull();
  });

  it("returns sanitized HTML when busy with markdown", () => {
    const html = pendingUserHtmlForPanelState(true, "# Title\n\n**bold**");
    expect(html).toContain("<h1");
    expect(html).toContain("Title");
    expect(html).toContain("<strong>");
  });
});
