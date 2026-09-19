import type { ProviderId } from "../../agent/providers/types";
import type { SlashCommand } from "./types";
import { discoverLocalProviderCommands, providerCommandsFromSdk } from "./discoverLocalCommands";
import { seedProviderCommands } from "./seedProviderCommands";

/** In-memory cache keyed by provider + workspace so switching providers cannot leak commands. */
const cacheByWorkspace = new Map<string, SlashCommand[]>();

function cacheKey(workspaceRoot: string, providerId: ProviderId): string {
  return `${providerId}\0${workspaceRoot.trim() || "."}`;
}

export function getCachedProviderCommands(
  workspaceRoot: string,
  providerId: ProviderId = "anthropic",
): SlashCommand[] {
  const key = cacheKey(workspaceRoot, providerId);
  return cacheByWorkspace.get(key) ?? [];
}

export function setCachedProviderCommands(
  workspaceRoot: string,
  commands: SlashCommand[],
  providerId: ProviderId = "anthropic",
): void {
  const key = cacheKey(workspaceRoot, providerId);
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
  providerId: ProviderId,
): SlashCommand[] {
  const workspace = workspaceRoot.trim() || ".";
  const key = cacheKey(workspace, providerId);
  const byName = new Map<string, SlashCommand>();

  for (const c of seedProviderCommands(providerId)) {
    byName.set(c.name.toLowerCase(), c);
  }
  for (const c of discoverLocalProviderCommands(workspace)) {
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
  providerId: ProviderId,
): SlashCommand[] {
  const mapped = providerCommandsFromSdk(sdkCommands);
  setCachedProviderCommands(workspaceRoot, mapped, providerId);
  return resolveProviderCommandCatalog(workspaceRoot, providerId);
}
