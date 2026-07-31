import { COLCOOR_SLASH_COMMANDS } from "./colcoorCommands";
import { isColcoorSlashName, type SlashCommand, type SlashCommandContext } from "./types";

/**
 * Merge Colcoor built-ins with provider-native commands.
 * Provider commands that collide with `/colcoor-*` are dropped (Colcoor wins the namespace).
 * Unprefixed Colcoor aliases are never added.
 */
export function buildSlashCommandCatalog(ctx: SlashCommandContext): SlashCommand[] {
  const out: SlashCommand[] = COLCOOR_SLASH_COMMANDS.map((c) => ({ ...c }));
  const reserved = new Set(out.map((c) => c.name.toLowerCase()));

  if (!ctx.capabilities.supportsProviderCommands && !ctx.capabilities.supportsSkills) {
    return out;
  }

  for (const cmd of ctx.providerCommands) {
    const key = cmd.name.trim().toLowerCase();
    if (!key) {
      continue;
    }
    if (isColcoorSlashName(key) || reserved.has(key)) {
      // Reject collisions: never let a provider override /colcoor-* or duplicate a Colcoor name.
      continue;
    }
    reserved.add(key);
    const available =
      cmd.source === "skill"
        ? ctx.capabilities.supportsSkills
        : ctx.capabilities.supportsProviderCommands;
    out.push({
      ...cmd,
      name: key,
      availability: available
        ? cmd.availability.kind === "available"
          ? { kind: "available" }
          : cmd.availability
        : {
            kind: "unavailable",
            reason:
              cmd.source === "skill"
                ? "Skills require Anthropic Plan/Agent mode (Claude Agent SDK)."
                : "Provider commands require Anthropic Plan/Agent mode (Claude Agent SDK).",
          },
    });
  }
  return out;
}

/** Filter catalog for autocomplete by prefix query (without leading slash). */
export function filterSlashCommands(catalog: SlashCommand[], query: string): SlashCommand[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    return catalog.slice(0, 24);
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
  return [...starts, ...contains].slice(0, 24);
}
