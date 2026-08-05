import { COLCOOR_SLASH_COMMANDS } from "./colcoorCommands";
import {
  isColcoorSlashName,
  type ProviderSlashCapabilities,
  type SlashCommand,
  type SlashCommandContext,
} from "./types";

/**
 * Merge Colcoor built-ins with provider-native commands.
 * Provider commands are always reflected in the catalog; availability depends on
 * provider × mode capabilities. Collisions with `/colcoor-*` are dropped.
 */
export function buildSlashCommandCatalog(ctx: SlashCommandContext): SlashCommand[] {
  const out: SlashCommand[] = COLCOOR_SLASH_COMMANDS.map((c) => ({ ...c }));
  const reserved = new Set(out.map((c) => c.name.toLowerCase()));

  for (const cmd of ctx.providerCommands) {
    const key = cmd.name.trim().toLowerCase();
    if (!key) {
      continue;
    }
    if (isColcoorSlashName(key) || reserved.has(key)) {
      continue;
    }
    reserved.add(key);
    out.push({
      ...cmd,
      name: key,
      availability: availabilityForProviderCommand(cmd, ctx),
    });
  }
  return out;
}

function availabilityForProviderCommand(
  cmd: SlashCommand,
  ctx: SlashCommandContext,
): SlashCommand["availability"] {
  const caps = ctx.capabilities;
  const executable =
    cmd.source === "skill" ? caps.supportsSkills : caps.supportsProviderCommands;
  if (executable) {
    return cmd.availability.kind === "available"
      ? { kind: "available" }
      : cmd.availability;
  }
  return { kind: "unavailable", reason: unavailableReason(ctx, caps) };
}

export function unavailableReason(
  ctx: Pick<SlashCommandContext, "providerId" | "cliMode">,
  caps: ProviderSlashCapabilities,
): string {
  if (ctx.providerId === "anthropic" && !caps.supportsProviderCommands && !caps.supportsSkills) {
    return `Requires Anthropic Plan or Agent mode (current mode: ${ctx.cliMode}). Use /colcoor-plan or /colcoor-agent.`;
  }
  if (ctx.providerId === "cursor" && !caps.supportsProviderCommands && !caps.supportsSkills) {
    return "Provider slash commands are disabled in stub mode.";
  }
  return "Unavailable for the current provider/mode.";
}

/** Filter catalog for autocomplete by prefix query (without leading slash). */
export function filterSlashCommands(catalog: SlashCommand[], query: string): SlashCommand[] {
  const q = query.trim().toLowerCase();
  const rank = (c: SlashCommand): number => (c.availability.kind === "available" ? 0 : 1);
  if (!q) {
    return [...catalog].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name)).slice(0, 24);
  }
  const starts: SlashCommand[] = [];
  const contains: SlashCommand[] = [];
  for (const c of catalog) {
    const name = c.name.toLowerCase();
    if (name.startsWith(q)) {
      starts.push(c);
    } else if (name.includes(q) || c.description.toLowerCase().includes(q)) {
      contains.push(c);
    }
  }
  return [...starts, ...contains]
    .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name))
    .slice(0, 24);
}
