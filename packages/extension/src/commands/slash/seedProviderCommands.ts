import type { ProviderId } from "../../agent/providers/types";
import type { SlashCommand } from "./types";

/**
 * Well-known Claude Code / Claude Agent SDK built-ins.
 * Shown before `supportedCommands()` is available so the Anthropic picker is not empty.
 * SDK/cache and disk skill entries override these on name collision.
 */
const ANTHROPIC_BUILTIN_COMMANDS: readonly Omit<SlashCommand, "availability">[] = [
  {
    name: "context",
    description: "Show context window usage breakdown",
    argumentHint: "[all]",
    source: "provider",
    execution: "provider",
  },
  {
    name: "compact",
    description: "Summarize the conversation to free context",
    argumentHint: "[instructions]",
    source: "provider",
    execution: "provider",
  },
  {
    name: "clear",
    description: "Start a new conversation with empty context",
    argumentHint: "[name]",
    source: "provider",
    execution: "provider",
  },
  {
    name: "usage",
    description: "Show session cost, plan limits, and activity stats",
    source: "provider",
    execution: "provider",
  },
  {
    name: "cost",
    description: "Alias for /usage",
    source: "provider",
    execution: "provider",
  },
  {
    name: "init",
    description: "Initialize project memory (CLAUDE.md)",
    source: "provider",
    execution: "provider",
  },
  {
    name: "review",
    description: "Run a structured code review",
    source: "provider",
    execution: "provider",
  },
  {
    name: "help",
    description: "List Claude Code slash commands",
    source: "provider",
    execution: "provider",
  },
] as const;

/**
 * Seed provider built-ins for the composer catalog.
 * - Anthropic: Claude Code built-ins (`/help`, `/init`, …)
 * - Cursor: none — the catalog comes from real Skills dirs on disk
 */
export function seedProviderCommands(providerId?: ProviderId): SlashCommand[] {
  if (providerId === "cursor") {
    return [];
  }
  return ANTHROPIC_BUILTIN_COMMANDS.map((c) => ({
    ...c,
    availability: { kind: "available" as const },
  }));
}
