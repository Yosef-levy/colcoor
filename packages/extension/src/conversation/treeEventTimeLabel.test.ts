import { describe, expect, it } from "vitest";

import { formatTreeEventTimeLabel, treeEventTimeLabelWebviewScriptBlock } from "./treeEventTimeLabel";

describe("formatTreeEventTimeLabel", () => {
  const base = Date.parse("2024-06-01T15:00:00.000Z");

  it("returns empty for missing or invalid input", () => {
    expect(formatTreeEventTimeLabel(undefined, base)).toBe("");
    expect(formatTreeEventTimeLabel("", base)).toBe("");
    expect(formatTreeEventTimeLabel("  ", base)).toBe("");
    expect(formatTreeEventTimeLabel("not-a-date", base)).toBe("");
  });

  it("returns empty for timestamps in the future relative to nowMs", () => {
    expect(formatTreeEventTimeLabel("2024-06-01T16:00:00.000Z", base)).toBe("");
  });

  it("uses just now under one minute", () => {
    expect(formatTreeEventTimeLabel("2024-06-01T14:59:30.000Z", base)).toBe("just now");
    expect(formatTreeEventTimeLabel("2024-06-01T14:59:01.000Z", base)).toBe("just now");
  });

  it("uses N minutes ago within the hour (strictly under 3600s)", () => {
    expect(formatTreeEventTimeLabel("2024-06-01T14:59:00.000Z", base)).toBe("1 minute ago");
    expect(formatTreeEventTimeLabel("2024-06-01T14:58:00.000Z", base)).toBe("2 minutes ago");
    expect(formatTreeEventTimeLabel("2024-06-01T14:01:00.000Z", base)).toBe("59 minutes ago");
  });

  it("uses local absolute hh:mm DD/MM/YYYY when one hour or older", () => {
    const label = formatTreeEventTimeLabel("2024-06-01T13:59:59.000Z", base);
    expect(label).toMatch(/^\d{2}:\d{2} \d{2}\/\d{2}\/\d{4}$/);
  });
});

describe("treeEventTimeLabelWebviewScriptBlock", () => {
  it("embeds the formatter so the webview defines eventTimeLabel", () => {
    const block = treeEventTimeLabelWebviewScriptBlock();
    expect(block).toContain("function eventTimeLabel(iso)");
    expect(block).toContain("formatTreeEventTimeLabel");
    expect(block).toContain("Date.now()");
  });
});
