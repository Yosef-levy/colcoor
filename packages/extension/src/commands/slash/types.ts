import type { CursorCliMode } from "../../agent/cursorCliMode";
import type { ProviderId } from "../../agent/providers/types";
import type { RunUserTurnOptions } from "../../conversation/runUserTurn";

/** Where a slash command originates. */
export type SlashCommandSource = "colcoor" | "provider" | "skill";

/** How Colcoor should execute a matched command. */
export type SlashCommandExecution = "local" | "turn-transform" | "provider";

/**
 * Capability flags for slash-command availability.
 * Depends on both provider and cli mode (ask vs plan/agent).
 */
export type ProviderSlashCapabilities = {
  /** Provider can discover/list native slash commands (e.g. Claude Agent SDK). */
  supportsProviderCommands: boolean;
  /** Provider can invoke skills via `/skill-name`. */
  supportsSkills: boolean;
  /** Provider exposes a structured context/usage breakdown. */
  supportsProviderContext: boolean;
  /** Provider can accept `disallowedTools`. */
  supportsDisallowedTools: boolean;
};

export type SlashCommandAvailability =
  | { kind: "available" }
  | { kind: "unavailable"; reason: string };

/** Catalog entry shown in the composer autocomplete. */
export type SlashCommand = {
  /** Command name without leading slash (e.g. `colcoor-help`, `context`). */
  name: string;
  description: string;
  argumentHint?: string;
  source: SlashCommandSource;
  execution: SlashCommandExecution;
  availability: SlashCommandAvailability;
};

/** Parsed leading slash invocation. */
export type SlashInvocation = {
  /** Command name without leading slash. */
  name: string;
  /** Remainder after the command token (may be empty). */
  args: string;
  /** Full original trimmed input. */
  rawText: string;
};

export type SlashCommandContext = {
  conversationId: string;
  providerId: ProviderId;
  cliMode: CursorCliMode;
  /** `auto` | `headless` | `stub` from settings. */
  agentMode: string;
  workspaceRoot: string;
  capabilities: ProviderSlashCapabilities;
  /** Currently selected model id (`auto` or concrete). */
  selectedModel: string;
  /** Known model labels for `/colcoor-model` listing. */
  modelOptions: { id: string; label: string }[];
  /** Provider/skill catalog from the active backend (may be empty before first SDK run). */
  providerCommands: SlashCommand[];
  /** Optional Colcoor context summary lines for `/colcoor-context`. */
  contextSummaryLines?: string[];
};

export type SlashCommandResult =
  | {
      action: "local";
      /** Transient markdown shown in the panel (not persisted). */
      message: string;
      /** Optional status-bar toast. */
      statusBar?: string;
    }
  | {
      action: "turn-transform";
      /** Clean user message after stripping the slash prefix (may be empty → no send). */
      userMessage: string;
      patch: Partial<Pick<RunUserTurnOptions, "cliMode" | "cliModel" | "privateBranch">>;
      /** Transient confirmation when there is no remaining body to send. */
      message?: string;
    }
  | {
      action: "provider";
      /** Text persisted / sent as the user turn body. */
      userMessage: string;
      /** Structured metadata to attach on the user_input event. */
      slashMeta: {
        command: string;
        args: string;
        source: SlashCommandSource;
      };
    }
  | {
      action: "resend";
      message?: string;
    }
  | {
      action: "error";
      message: string;
    };

/** Prefix reserved exclusively for Colcoor-owned commands. */
export const COLCOOR_SLASH_PREFIX = "colcoor-";

export function isColcoorSlashName(name: string): boolean {
  return name.toLowerCase().startsWith(COLCOOR_SLASH_PREFIX);
}

/** Display form with leading slash. */
export function slashDisplayName(name: string): string {
  return `/${name}`;
}
