import { describe, expect, it } from "vitest";

import { parseCursorAgentModelsStdout } from "./cursorAgentModels";

describe("parseCursorAgentModelsStdout", () => {
  it("returns empty for blank or unavailable message", () => {
    expect(parseCursorAgentModelsStdout("")).toEqual([]);
    expect(parseCursorAgentModelsStdout("No models available for this account.")).toEqual([]);
  });

  it("parses one model per line", () => {
    expect(parseCursorAgentModelsStdout("gpt-5.2\nsonnet-4.5-thinking\n")).toEqual([
      "gpt-5.2",
      "sonnet-4.5-thinking",
    ]);
  });

  it("parses JSON string arrays", () => {
    expect(parseCursorAgentModelsStdout('["m1","m2"]')).toEqual(["m1", "m2"]);
  });

  it("dedupes models", () => {
    expect(parseCursorAgentModelsStdout("m1\nm1\n* m2\n")).toEqual(["m1", "m2"]);
  });
});
