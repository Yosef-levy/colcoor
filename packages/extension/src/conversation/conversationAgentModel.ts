import type * as vscode from "vscode";

/** Sentinel stored in workspace state and sent to the webview (no `--model` flag). */
export const AGENT_MODEL_AUTO = "auto";

export const AGENT_MODEL_BY_CONVERSATION_KEY = "colcoor.agentModelByConversation";

export type AgentModelByConversationMap = Record<string, string>;

export function readAgentModelByConversationMap(
  workspaceState: vscode.Memento,
): AgentModelByConversationMap {
  const raw = workspaceState.get<unknown>(AGENT_MODEL_BY_CONVERSATION_KEY);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }
  const out: AgentModelByConversationMap = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof k !== "string" || typeof v !== "string") {
      continue;
    }
    const id = k.trim();
    const model = normalizeStoredAgentModel(v);
    if (id && model) {
      out[id] = model;
    }
  }
  return out;
}

export function normalizeStoredAgentModel(raw: string | undefined): string {
  const t = raw?.trim();
  if (!t || t === AGENT_MODEL_AUTO) {
    return AGENT_MODEL_AUTO;
  }
  return t;
}

export function readSelectedAgentModelForConversation(
  map: AgentModelByConversationMap,
  conversationId: string,
): string {
  return normalizeStoredAgentModel(map[conversationId]);
}

export async function writeSelectedAgentModelForConversation(
  workspaceState: vscode.Memento,
  conversationId: string,
  model: string,
): Promise<AgentModelByConversationMap> {
  const cid = conversationId.trim();
  if (!cid) {
    return readAgentModelByConversationMap(workspaceState);
  }
  const map = readAgentModelByConversationMap(workspaceState);
  const next = normalizeStoredAgentModel(model);
  if (next === AGENT_MODEL_AUTO) {
    delete map[cid];
  } else {
    map[cid] = next;
  }
  await workspaceState.update(AGENT_MODEL_BY_CONVERSATION_KEY, map);
  return map;
}

/** Value for `agent --model` when Colcoor runs headless CLI; `auto` omits the flag. */
export function agentModelCliFlag(selected: string | undefined): string | undefined {
  const t = selected?.trim();
  if (!t || t === AGENT_MODEL_AUTO) {
    return undefined;
  }
  return t;
}
