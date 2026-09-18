import { describe, expect, it } from "vitest";

import {
  ANTHROPIC_PROVIDER_MODELS,
  curateProviderModelsForComposer,
  providerModelCatalogSnapshot,
} from "./providerModelCatalog";

describe("providerModelCatalog", () => {
  it("returns Anthropic models for the anthropic provider", () => {
    const snap = providerModelCatalogSnapshot("anthropic");
    expect(snap.all).toEqual(ANTHROPIC_PROVIDER_MODELS);
    expect(snap.curated.length).toBeGreaterThan(0);
    expect(snap.curated.every((e) => snap.all.some((a) => a.id === e.id))).toBe(true);
    expect(snap.hint).toBeNull();
  });

  it("curates a short composer list from the full catalog", () => {
    const curated = curateProviderModelsForComposer(ANTHROPIC_PROVIDER_MODELS);
    expect(curated.map((e) => e.id)).toEqual([
      "claude-opus-4-5",
      "claude-sonnet-4-5",
      "claude-haiku-4-5",
    ]);
  });
});
