import type { SlashCommand } from "./types";

/**
 * Built-in Colcoor commands. Names MUST use the `colcoor-` prefix.
 * Never alias these to unprefixed names (reserved for provider-native commands).
 */
export const COLCOOR_SLASH_COMMANDS: readonly SlashCommand[] = [
  {
    name: "colcoor-help",
    description: "List available Colcoor and provider slash commands",
    source: "colcoor",
    execution: "local",
    availability: { kind: "available" },
  },
  {
    name: "colcoor-context",
    description: "Show Colcoor context / token savings summary for this conversation",
    source: "colcoor",
    execution: "local",
    availability: { kind: "available" },
  },
  {
    name: "colcoor-skills",
    description: "List skills and provider commands available for the current backend",
    source: "colcoor",
    execution: "local",
    availability: { kind: "available" },
  },
  {
    name: "colcoor-model",
    description: "Show or set the model for this conversation",
    argumentHint: "<model-id|auto>",
    source: "colcoor",
    execution: "local",
    availability: { kind: "available" },
  },
  {
    name: "colcoor-ask",
    description: "Switch this conversation to Ask mode (optional message follows)",
    argumentHint: "[message]",
    source: "colcoor",
    execution: "turn-transform",
    availability: { kind: "available" },
  },
  {
    name: "colcoor-plan",
    description: "Switch this conversation to Plan mode (optional message follows)",
    argumentHint: "[message]",
    source: "colcoor",
    execution: "turn-transform",
    availability: { kind: "available" },
  },
  {
    name: "colcoor-agent",
    description: "Switch this conversation to Agent mode (optional message follows)",
    argumentHint: "[message]",
    source: "colcoor",
    execution: "turn-transform",
    availability: { kind: "available" },
  },
  {
    name: "colcoor-private",
    description: "Send the following message as a private draft branch",
    argumentHint: "<message>",
    source: "colcoor",
    execution: "turn-transform",
    availability: { kind: "available" },
  },
  {
    name: "colcoor-resend",
    description: "Resend the selected assistant message",
    source: "colcoor",
    execution: "local",
    availability: { kind: "available" },
  },
] as const;

export function colcoorSlashCommandByName(name: string): SlashCommand | undefined {
  const key = name.trim().toLowerCase();
  return COLCOOR_SLASH_COMMANDS.find((c) => c.name === key);
}
