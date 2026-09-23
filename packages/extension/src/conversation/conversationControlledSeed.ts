import type * as vscode from "vscode";
import type { CursorCliMode } from "../agent/cursorCliMode";
import type { ProviderId } from "../agent/providers/types";

export const CONTROLLED_SEED_BY_CONVERSATION_KEY =
  "colcoor.controlledSeedByConversation";
export const DEFAULT_CONTROLLED_TEMPERATURE = "0";
export const MAX_GENERATION_SEED = 2_147_483_647;

export type ControlledSeedState = {
  enabled: boolean;
  seed: string;
  temperature: string;
};

export type ControlledSeedByConversationMap = Record<string, ControlledSeedState>;

export type ParsedControlledSeed = {
  seed: number;
  temperature: number;
};

const DEFAULT_STATE: ControlledSeedState = {
  enabled: false,
  seed: "",
  temperature: DEFAULT_CONTROLLED_TEMPERATURE,
};

function normalizeState(raw: unknown): ControlledSeedState | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return undefined;
  }
  const value = raw as Record<string, unknown>;
  return {
    enabled: value.enabled === true,
    seed: typeof value.seed === "string" ? value.seed.trim() : "",
    temperature:
      typeof value.temperature === "string" && value.temperature.trim()
        ? value.temperature.trim()
        : DEFAULT_CONTROLLED_TEMPERATURE,
  };
}

export function readControlledSeedByConversationMap(
  workspaceState: vscode.Memento,
): ControlledSeedByConversationMap {
  const raw = workspaceState.get<unknown>(CONTROLLED_SEED_BY_CONVERSATION_KEY);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }
  const out: ControlledSeedByConversationMap = {};
  for (const [conversationId, value] of Object.entries(raw as Record<string, unknown>)) {
    const id = conversationId.trim();
    const normalized = normalizeState(value);
    if (id && normalized) {
      out[id] = normalized;
    }
  }
  return out;
}

export function readControlledSeedForConversation(
  map: ControlledSeedByConversationMap,
  conversationId: string,
): ControlledSeedState {
  return normalizeState(map[conversationId]) ?? { ...DEFAULT_STATE };
}

export async function writeControlledSeedForConversation(
  workspaceState: vscode.Memento,
  conversationId: string,
  patch: Partial<ControlledSeedState>,
): Promise<ControlledSeedByConversationMap> {
  const id = conversationId.trim();
  const map = readControlledSeedByConversationMap(workspaceState);
  if (!id) {
    return map;
  }
  const current = readControlledSeedForConversation(map, id);
  map[id] = {
    enabled: patch.enabled ?? current.enabled,
    seed: typeof patch.seed === "string" ? patch.seed.trim() : current.seed,
    temperature:
      typeof patch.temperature === "string"
        ? patch.temperature.trim()
        : current.temperature,
  };
  await workspaceState.update(CONTROLLED_SEED_BY_CONVERSATION_KEY, map);
  return map;
}

export function randomGenerationSeed(random = Math.random): string {
  return String(Math.floor(random() * (MAX_GENERATION_SEED + 1)));
}

export function parseControlledSeed(
  seedRaw: string,
  temperatureRaw: string,
): ParsedControlledSeed {
  const seedText = seedRaw.trim();
  if (!/^\d+$/u.test(seedText)) {
    throw new Error("Controlled seed must be an integer from 0 to 2147483647.");
  }
  const seed = Number(seedText);
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > MAX_GENERATION_SEED) {
    throw new Error("Controlled seed must be an integer from 0 to 2147483647.");
  }

  const temperatureText = temperatureRaw.trim() || DEFAULT_CONTROLLED_TEMPERATURE;
  const temperature = Number(temperatureText);
  if (!Number.isFinite(temperature) || temperature < 0 || temperature > 2) {
    throw new Error("Controlled temperature must be a number from 0 to 2.");
  }
  return { seed, temperature };
}

export function controlledSeedUnavailableReason(
  providerId: ProviderId,
  cliMode: CursorCliMode,
): string | undefined {
  if (providerId !== "gemini" || cliMode !== "ask") {
    return "Controlled seed mode requires Gemini in Ask mode.";
  }
  return undefined;
}
