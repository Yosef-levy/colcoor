import type { CursorAgentModelEntry } from "./cursorAgentModelCatalog";
import type { ProviderId } from "./providers/types";
import type { AgentModelCatalogSnapshot } from "./agentModelCatalogCache";

/** Known Anthropic model ids for the VS Code (provider-direct) extension path. */
export const ANTHROPIC_PROVIDER_MODELS: CursorAgentModelEntry[] = [
  { id: "claude-opus-4-5", label: "Claude Opus 4.5" },
  { id: "claude-sonnet-4-5", label: "Claude Sonnet 4.5" },
  { id: "claude-haiku-4-5", label: "Claude Haiku 4.5" },
  { id: "claude-opus-4-1", label: "Claude Opus 4.1" },
  { id: "claude-sonnet-4-0", label: "Claude Sonnet 4.0" },
  { id: "claude-3-7-sonnet-latest", label: "Claude 3.7 Sonnet" },
  { id: "claude-3-5-haiku-latest", label: "Claude 3.5 Haiku" },
];

/** Composer dropdown subset for direct Anthropic provider runs. */
export function curateProviderModelsForComposer(
  entries: CursorAgentModelEntry[],
): CursorAgentModelEntry[] {
  const want = new Set(["claude-sonnet-4-5", "claude-opus-4-5", "claude-haiku-4-5"]);
  const curated = entries.filter((e) => want.has(e.id));
  return curated.length > 0 ? curated : entries.slice(0, 3);
}

export function providerModelCatalogSnapshot(provider: ProviderId): AgentModelCatalogSnapshot {
  if (provider !== "anthropic") {
    return {
      curated: [],
      all: [],
      hint: "No model list for this provider.",
    };
  }
  const all = [...ANTHROPIC_PROVIDER_MODELS];
  return {
    curated: curateProviderModelsForComposer(all),
    all,
    hint: null,
  };
}
