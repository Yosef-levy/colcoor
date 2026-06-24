import type * as vscode from "vscode";
import {
  CURSOR_CLI_MODE_ASK,
  normalizeCursorCliMode,
  type CursorCliMode,
} from "../agent/cursorCliMode";

export const AGENT_MODE_BY_CONVERSATION_KEY = "colcoor.agentModeByConversation";

export type AgentModeByConversationMap = Record<string, CursorCliMode>;

export function readAgentModeByConversationMap(
  workspaceState: vscode.Memento,
): AgentModeByConversationMap {
  const raw = workspaceState.get<unknown>(AGENT_MODE_BY_CONVERSATION_KEY);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }
  const out: AgentModeByConversationMap = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof k !== "string" || typeof v !== "string") {
      continue;
    }
    const id = k.trim();
    const mode = normalizeCursorCliMode(v);
    if (id) {
      out[id] = mode;
    }
  }
  return out;
}

export function readSelectedAgentModeForConversation(
  map: AgentModeByConversationMap,
  conversationId: string,
): CursorCliMode {
  return normalizeCursorCliMode(map[conversationId]);
}

export async function writeSelectedAgentModeForConversation(
  workspaceState: vscode.Memento,
  conversationId: string,
  mode: string,
): Promise<AgentModeByConversationMap> {
  const cid = conversationId.trim();
  if (!cid) {
    return readAgentModeByConversationMap(workspaceState);
  }
  const map = readAgentModeByConversationMap(workspaceState);
  const next = normalizeCursorCliMode(mode);
  if (next === CURSOR_CLI_MODE_ASK) {
    delete map[cid];
  } else {
    map[cid] = next;
  }
  await workspaceState.update(AGENT_MODE_BY_CONVERSATION_KEY, map);
  return map;
}
