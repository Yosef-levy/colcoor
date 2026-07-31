import type { CursorCliMode } from "../../agent/cursorCliMode";
import { CURSOR_CLI_MODE_ASK } from "../../agent/cursorCliMode";
import type { ProviderId } from "../../agent/providers/types";
import type { ProviderSlashCapabilities } from "./types";

/**
 * Slash-command capabilities for the active provider × mode combination.
 * Claude Agent SDK (plan/agent) is the only backend with native commands/skills today.
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
      supportsProviderCommands: false,
      supportsSkills: false,
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
