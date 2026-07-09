import type { GraphEventNode } from "../api/client";
import type { AgentSessionPlan } from "../agent/providers/types";

export const COLCOOR_AGENT_SESSION_KEY = "colcoor_agent_session";

export type ColcoorAgentSession = {
  provider: string;
  session_id: string;
  /** UUID of the last message in the session, used as a fork anchor when branching. */
  last_message_id?: string;
  model?: string;
};

export function readAgentSession(
  contentJson: Record<string, unknown> | null | undefined,
): ColcoorAgentSession | undefined {
  if (!contentJson) {
    return undefined;
  }
  const raw = contentJson[COLCOOR_AGENT_SESSION_KEY];
  if (!raw || typeof raw !== "object") {
    return undefined;
  }
  const o = raw as Record<string, unknown>;
  const session_id = typeof o.session_id === "string" ? o.session_id.trim() : "";
  if (!session_id) {
    return undefined;
  }
  const provider = typeof o.provider === "string" ? o.provider.trim() : "";
  const last_message_id =
    typeof o.last_message_id === "string" && o.last_message_id.trim()
      ? o.last_message_id.trim()
      : undefined;
  const model = typeof o.model === "string" && o.model.trim() ? o.model.trim() : undefined;
  return { provider, session_id, last_message_id, model };
}

export function buildAgentSessionJson(input: {
  provider: string;
  sessionId: string;
  lastMessageId?: string;
  model?: string;
}): Record<string, unknown> | undefined {
  const sessionId = input.sessionId.trim();
  if (!sessionId) {
    return undefined;
  }
  const session: ColcoorAgentSession = {
    provider: input.provider,
    session_id: sessionId,
    ...(input.lastMessageId?.trim() ? { last_message_id: input.lastMessageId.trim() } : {}),
    ...(input.model?.trim() ? { model: input.model.trim() } : {}),
  };
  return { [COLCOOR_AGENT_SESSION_KEY]: session };
}

/**
 * Decide how a stateful agent backend should continue for a new turn attached under `attachNode`.
 * Resume when extending the session's own tip; fork when branching from an earlier point; fresh when
 * no ancestor carries a session (e.g. legacy data or an ask-only branch).
 */
export function resolveAgentSessionPlan(
  events: readonly GraphEventNode[],
  attachNode: GraphEventNode,
): AgentSessionPlan {
  const byId = new Map(events.map((e) => [e.id, e]));
  const hasChildren = new Set<string>();
  for (const e of events) {
    if (e.parent_event_id) {
      hasChildren.add(e.parent_event_id);
    }
  }

  let cur: GraphEventNode | undefined = attachNode;
  const seen = new Set<string>();
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    const session = readAgentSession(cur.content_json ?? undefined);
    if (session) {
      const isTip = cur.id === attachNode.id && !hasChildren.has(cur.id);
      if (isTip) {
        return { kind: "resume", sessionId: session.session_id };
      }
      return {
        kind: "fork",
        sessionId: session.session_id,
        upToMessageId: session.last_message_id,
      };
    }
    cur = cur.parent_event_id ? byId.get(cur.parent_event_id) : undefined;
  }
  return { kind: "fresh" };
}
