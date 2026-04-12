import { describe, expect, it } from "vitest";
import { extractAgentTraceEntries } from "./threadSegments";

describe("extractAgentTraceEntries", () => {
  it("returns entries from colcoor_agent_trace", () => {
    const entries = extractAgentTraceEntries({
      colcoor_agent_trace: { version: 1, entries: [{ type: "system" }] },
    });
    expect(entries).toEqual([{ type: "system" }]);
  });

  it("returns undefined when missing or empty", () => {
    expect(extractAgentTraceEntries(undefined)).toBeUndefined();
    expect(extractAgentTraceEntries({})).toBeUndefined();
    expect(extractAgentTraceEntries({ colcoor_agent_trace: { version: 1, entries: [] } })).toBeUndefined();
  });
});
