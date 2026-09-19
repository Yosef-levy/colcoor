import type { CursorAgentModelEntry } from "../cursorAgentModelCatalog";
import type { CursorCliMode } from "../cursorCliMode";
import type { ProviderCapabilities, ProviderId } from "./types";

export type ProviderDescriptor = {
  id: ProviderId;
  displayName: string;
  secretKey: string;
  apiKeyConsoleUrl: string;
  apiKeyHint: string;
  apiKeyRequirement: "always" | "ask-only";
  defaultAskModel: string;
  defaultAgentModel: string;
  models: readonly CursorAgentModelEntry[];
  curatedModelIds: readonly string[];
  capabilities(mode: CursorCliMode, agentMode: string): ProviderCapabilities;
};

const none = (): ProviderCapabilities => ({
  supportsProviderCommands: false,
  supportsSkills: false,
  supportsProviderContext: false,
  supportsDisallowedTools: false,
  supportsSessionFork: false,
  supportsStructuredMessages: false,
  supportsDisplayParts: false,
});

const anthropicModels = [
  { id: "claude-opus-4-5", label: "Claude Opus 4.5" },
  { id: "claude-sonnet-4-5", label: "Claude Sonnet 4.5" },
  { id: "claude-haiku-4-5", label: "Claude Haiku 4.5" },
  { id: "claude-opus-4-1", label: "Claude Opus 4.1" },
  { id: "claude-sonnet-4-0", label: "Claude Sonnet 4.0" },
  { id: "claude-3-7-sonnet-latest", label: "Claude 3.7 Sonnet" },
  { id: "claude-3-5-haiku-latest", label: "Claude 3.5 Haiku" },
] as const;

const geminiModels = [
  { id: "gemini-3.5-flash", label: "Gemini 3.5 Flash" },
  { id: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro Preview" },
  { id: "gemini-3.5-flash-lite", label: "Gemini 3.5 Flash Lite" },
] as const;

export const PROVIDER_DESCRIPTORS: Record<ProviderId, ProviderDescriptor> = {
  anthropic: {
    id: "anthropic",
    displayName: "Anthropic",
    secretKey: "colcoor.anthropicApiKey",
    apiKeyConsoleUrl: "https://console.anthropic.com/settings/keys",
    apiKeyHint: "starts with sk-ant-",
    apiKeyRequirement: "always",
    defaultAskModel: "claude-sonnet-4-5",
    defaultAgentModel: "claude-sonnet-4-5",
    models: anthropicModels,
    curatedModelIds: ["claude-sonnet-4-5", "claude-opus-4-5", "claude-haiku-4-5"],
    capabilities(mode, agentMode) {
      if (agentMode === "stub") return none();
      if (mode === "ask") return { ...none(), supportsStructuredMessages: true };
      return {
        supportsProviderCommands: true,
        supportsSkills: true,
        supportsProviderContext: true,
        supportsDisallowedTools: true,
        supportsSessionFork: true,
        supportsStructuredMessages: false,
        supportsDisplayParts: false,
      };
    },
  },
  gemini: {
    id: "gemini",
    displayName: "Gemini",
    secretKey: "colcoor.geminiApiKey",
    apiKeyConsoleUrl: "https://aistudio.google.com/app/apikey",
    apiKeyHint: "Google AI Studio API key",
    apiKeyRequirement: "ask-only",
    defaultAskModel: "gemini-3.5-flash",
    defaultAgentModel: "gemini-3.1-pro-preview",
    models: geminiModels,
    curatedModelIds: geminiModels.map((model) => model.id),
    capabilities(mode, agentMode) {
      if (agentMode === "stub") return none();
      if (mode === "ask") return { ...none(), supportsStructuredMessages: true };
      return {
        supportsProviderCommands: true,
        supportsSkills: true,
        supportsProviderContext: true,
        supportsDisallowedTools: true,
        supportsSessionFork: false,
        supportsStructuredMessages: false,
        supportsDisplayParts: true,
      };
    },
  },
  cursor: {
    id: "cursor",
    displayName: "Cursor",
    secretKey: "colcoor.cursorAgentApiKey",
    apiKeyConsoleUrl: "https://cursor.com/settings",
    apiKeyHint: "Cursor API key",
    apiKeyRequirement: "always",
    defaultAskModel: "auto",
    defaultAgentModel: "auto",
    models: [],
    curatedModelIds: [],
    capabilities(_mode, agentMode) {
      if (agentMode === "stub") return none();
      return {
        supportsProviderCommands: true,
        supportsSkills: true,
        supportsProviderContext: false,
        supportsDisallowedTools: false,
        supportsSessionFork: false,
        supportsStructuredMessages: false,
        supportsDisplayParts: true,
      };
    },
  },
};

export function isProviderId(value: string | undefined): value is ProviderId {
  return Boolean(value && Object.prototype.hasOwnProperty.call(PROVIDER_DESCRIPTORS, value));
}

export function providerDescriptor(id: ProviderId): ProviderDescriptor {
  return PROVIDER_DESCRIPTORS[id];
}
