import type { CursorCliMode } from "../../agent/cursorCliMode";
import type { ProviderId } from "../../agent/providers/types";
import type { ProviderSlashCapabilities } from "./types";
import { providerDescriptor } from "../../agent/providers/providerDescriptors";

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
  const capabilities = providerDescriptor(params.providerId).capabilities(
    params.cliMode,
    params.agentMode,
  );
  return {
    supportsProviderCommands: capabilities.supportsProviderCommands,
    supportsSkills: capabilities.supportsSkills,
    supportsProviderContext: capabilities.supportsProviderContext,
    supportsDisallowedTools: capabilities.supportsDisallowedTools,
  };
}
