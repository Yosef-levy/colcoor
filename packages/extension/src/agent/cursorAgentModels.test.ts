import { describe, expect, it } from "vitest";

import { parseCursorAgentModelsStdout } from "./cursorAgentModelCatalog";

describe("cursorAgentModels integration", () => {
  it("re-exports parse via catalog for CLI stdout", () => {
    expect(parseCursorAgentModelsStdout("gpt-5.2 - GPT-5.2\n")).toEqual([
      { id: "gpt-5.2", label: "GPT-5.2" },
    ]);
  });
});
