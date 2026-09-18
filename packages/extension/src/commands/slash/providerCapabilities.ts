import type { CursorCliMode } from "../../agent/cursorCliMode";
import { CURSOR_CLI_MODE_ASK } from "../../agent/cursorCliMode";
import type { ProviderId } from "../../agent/providers/types";
import type { ProviderSlashCapabilities } from "./types";

/**
 * Slash-command capabilities for the active provider × mode combination.
 * - Anthropic Plan/Agent: Claude Agent SDK native commands/skills
 * - Cursor: pass-through of `/command` text to the headless CLI prompt
 * - Anthropic Ask: Messages API has no Claude Code command surface
 */
export function resolveProviderSlashCapabilities(params: {
  providerId: ProviderId;
  cliMode: CursorCliMode;
  agentMode: string;
}): ProviderSlashCapabilities {
  if (params.agentMode === "stub") {
    return {
      supportsProviderCommands: false,
      supportsSkills: false,
      supportsProviderContext: false,
      supportsDisallowedTools: false,
    };
  }
  if (params.providerId === "cursor") {
    return {
      supportsProviderCommands: true,
      supportsSkills: true,
      supportsProviderContext: false,
      supportsDisallowedTools: false,
    };
  }
  // anthropic
  if (params.cliMode === CURSOR_CLI_MODE_ASK) {
    return {
      supportsProviderCommands: false,
      supportsSkills: false,
      supportsProviderContext: false,
      supportsDisallowedTools: false,
    };
  }
  return {
    supportsProviderCommands: true,
    supportsSkills: true,
    supportsProviderContext: true,
    supportsDisallowedTools: true,
  };
}
