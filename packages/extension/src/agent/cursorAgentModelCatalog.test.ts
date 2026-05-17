import { describe, expect, it } from "vitest";

import {
  curateAgentModelsForComposer,
  mediumTierScore,
  modelFamilyKey,
  modelProductKey,
  parseCursorAgentModelsStdout,
} from "./cursorAgentModelCatalog";

const SAMPLE = `Available models

auto - Auto
composer-2-fast - Composer 2 Fast (current, default)
composer-2 - Composer 2
gpt-5.3-codex-low - Codex 5.3 Low
gpt-5.3-codex - Codex 5.3
gpt-5.3-codex-high - Codex 5.3 High
gpt-5.2-codex - Codex 5.2
gpt-5.5-medium - GPT-5.5 1M
gpt-5.5-high - GPT-5.5 1M High
claude-4.6-sonnet-medium - Sonnet 4.6 1M
claude-4.5-sonnet-medium - Sonnet 4.5 1M
`;

describe("parseCursorAgentModelsStdout", () => {
  it("parses id - label lines and skips header", () => {
    const entries = parseCursorAgentModelsStdout(SAMPLE);
    expect(entries.find((e) => e.id === "auto")?.label).toBe("Auto");
    expect(entries.find((e) => e.id === "gpt-5.5-medium")?.label).toContain("GPT-5.5");
  });

  it("returns empty for unavailable message", () => {
    expect(parseCursorAgentModelsStdout("No models available for this account.")).toEqual([]);
  });
});

describe("curateAgentModelsForComposer", () => {
  it("drops auto and picks medium/base per latest product line", () => {
    const curated = curateAgentModelsForComposer(parseCursorAgentModelsStdout(SAMPLE));
    const ids = curated.map((e) => e.id);
    expect(ids).not.toContain("auto");
    expect(ids).not.toContain("gpt-5.3-codex-high");
    expect(ids).not.toContain("gpt-5.2-codex");
    expect(ids).toContain("gpt-5.3-codex");
    expect(ids).toContain("gpt-5.5-medium");
    expect(ids).toContain("claude-4.6-sonnet-medium");
    expect(ids).not.toContain("claude-4.5-sonnet-medium");
    expect(ids).toContain("composer-2");
  });
});

describe("modelFamilyKey and mediumTierScore", () => {
  it("strips tier suffixes for grouping", () => {
    expect(modelFamilyKey("gpt-5.3-codex-high-fast")).toBe("gpt-5.3-codex");
    expect(mediumTierScore("gpt-5.3-codex", "gpt-5.3-codex")).toBe(80);
    expect(mediumTierScore("gpt-5.5-medium", "gpt-5.5")).toBe(100);
  });

  it("assigns product keys for version compare", () => {
    expect(modelProductKey("gpt-5.3-codex").product).toBe("gpt-codex");
    expect(modelProductKey("gpt-5.5").product).toBe("gpt");
  });
});
