import type { CursorAgentModelEntry } from "../agent/cursorAgentModelCatalog";
import type { AgentModelCatalogSnapshot } from "../agent/agentModelCatalogCache";
import { AGENT_MODEL_AUTO } from "./conversationAgentModel";

export const COLOOR_AGENT_META_KEY = "colcoor_agent_meta";

export type ColcoorAgentMeta = {
  model_id?: string;
  model_label?: string;
};

export function readColcoorAgentMeta(
  contentJson: Record<string, unknown> | null | undefined,
): ColcoorAgentMeta | undefined {
  if (!contentJson) {
    return undefined;
  }
  const raw = contentJson[COLOOR_AGENT_META_KEY];
  if (!raw || typeof raw !== "object") {
    return undefined;
  }
  const o = raw as Record<string, unknown>;
  const model_id = typeof o.model_id === "string" ? o.model_id.trim() : undefined;
  const model_label = typeof o.model_label === "string" ? o.model_label.trim() : undefined;
  if (!model_id && !model_label) {
    return undefined;
  }
  return { model_id, model_label };
}

export function buildColcoorAgentMeta(
  modelId: string | undefined,
  modelLabel: string | undefined,
): Record<string, unknown> | undefined {
  const id = modelId?.trim();
  const label = modelLabel?.trim();
  if (!id && !label) {
    return undefined;
  }
  return {
    [COLOOR_AGENT_META_KEY]: {
      ...(id ? { model_id: id } : {}),
      ...(label ? { model_label: label } : {}),
    },
  };
}

export function mergeAssistantContentJson(
  traceJson: Record<string, unknown> | undefined,
  metaJson: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!traceJson && !metaJson) {
    return undefined;
  }
  return { ...traceJson, ...metaJson };
}

/** Strip CLI parentheticals like “(current, default)” from catalog labels. */
export function normalizeModelCatalogLabel(label: string): string {
  return label.replace(/\s*\([^)]*\)\s*$/u, "").trim();
}

export function shortLabelFromCatalogEntry(entry: CursorAgentModelEntry): string {
  const label = normalizeModelCatalogLabel(entry.label);
  return label || entry.id;
}

export function resolveAgentModelShortLabel(
  modelId: string | undefined,
  catalog: AgentModelCatalogSnapshot,
): string | undefined {
  const id = modelId?.trim();
  if (!id || id === AGENT_MODEL_AUTO) {
    return "Auto";
  }
  const fromAll = catalog.all.find((e) => e.id === id);
  if (fromAll) {
    return shortLabelFromCatalogEntry(fromAll);
  }
  const fromCurated = catalog.curated.find((e) => e.id === id);
  if (fromCurated) {
    return shortLabelFromCatalogEntry(fromCurated);
  }
  return id;
}

export function assistantDisplayModelFromEvent(
  contentJson: Record<string, unknown> | null | undefined,
  catalog: AgentModelCatalogSnapshot,
): string | undefined {
  const meta = readColcoorAgentMeta(contentJson);
  if (meta?.model_label) {
    return normalizeModelCatalogLabel(meta.model_label);
  }
  if (meta?.model_id) {
    return resolveAgentModelShortLabel(meta.model_id, catalog);
  }
  return undefined;
}

/** `Assistant (GPT-5.5 1M)` or `Assistant` when unknown. */
export function formatAssistantRoleLabel(modelShortLabel: string | undefined): string {
  const d = modelShortLabel?.trim();
  return d ? `Assistant (${d})` : "Assistant";
}
