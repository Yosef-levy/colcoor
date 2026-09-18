import type { ProviderId } from "../../agent/providers/types";
import type { SlashCommand } from "./types";
import { discoverLocalProviderCommands, providerCommandsFromSdk } from "./discoverLocalCommands";
import { seedProviderCommands } from "./seedProviderCommands";

/** In-memory cache of provider slash commands keyed by workspace root. */
const cacheByWorkspace = new Map<string, SlashCommand[]>();

export function getCachedProviderCommands(workspaceRoot: string): SlashCommand[] {
  const key = workspaceRoot.trim() || ".";
  return cacheByWorkspace.get(key) ?? [];
}

export function setCachedProviderCommands(workspaceRoot: string, commands: SlashCommand[]): void {
  const key = workspaceRoot.trim() || ".";
  cacheByWorkspace.set(key, commands);
}

export function clearProviderCommandCatalogCache(): void {
  cacheByWorkspace.clear();
}

/**
 * Merge seeded built-ins, disk discovery (Cursor + Claude skills), and SDK cache.
 * Precedence (last wins): Anthropic seeds (if any) → Cursor/Claude disk skills → SDK cache.
 */
export function resolveProviderCommandCatalog(
  workspaceRoot: string,
  providerId: ProviderId = "anthropic",
): SlashCommand[] {
  const key = workspaceRoot.trim() || ".";
  const byName = new Map<string, SlashCommand>();

  for (const c of seedProviderCommands(providerId)) {
    byName.set(c.name.toLowerCase(), c);
  }
  for (const c of discoverLocalProviderCommands(key)) {
    byName.set(c.name.toLowerCase(), c);
  }
  for (const c of cacheByWorkspace.get(key) ?? []) {
    byName.set(c.name.toLowerCase(), c);
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Update cache from Claude Agent SDK `supportedCommands()` / `commands_changed`. */
export function updateProviderCommandCatalogFromSdk(
  workspaceRoot: string,
  sdkCommands: Array<{
    name?: string;
    description?: string;
    argumentHint?: string;
    aliases?: string[];
  }>,
  providerId: ProviderId = "anthropic",
): SlashCommand[] {
  const mapped = providerCommandsFromSdk(sdkCommands);
  setCachedProviderCommands(workspaceRoot, mapped);
  return resolveProviderCommandCatalog(workspaceRoot, providerId);
}
