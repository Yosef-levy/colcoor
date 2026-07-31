import type { SlashCommand } from "./types";
import { discoverLocalProviderCommands, providerCommandsFromSdk } from "./discoverLocalCommands";

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
 * Merge disk discovery with any SDK-reported catalog (SDK wins on name collisions).
 */
export function resolveProviderCommandCatalog(workspaceRoot: string): SlashCommand[] {
  const key = workspaceRoot.trim() || ".";
  const fromDisk = discoverLocalProviderCommands(key);
  const cached = cacheByWorkspace.get(key) ?? [];
  if (cached.length === 0) {
    return fromDisk;
  }
  const byName = new Map<string, SlashCommand>();
  for (const c of fromDisk) {
    byName.set(c.name.toLowerCase(), c);
  }
  for (const c of cached) {
    byName.set(c.name.toLowerCase(), c);
  }
  return [...byName.values()];
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
): SlashCommand[] {
  const mapped = providerCommandsFromSdk(sdkCommands);
  setCachedProviderCommands(workspaceRoot, mapped);
  return resolveProviderCommandCatalog(workspaceRoot);
}
