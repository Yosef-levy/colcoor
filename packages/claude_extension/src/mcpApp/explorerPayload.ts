import type {
  ColcoorApiClient,
  ConversationUserStateOut,
  GraphEventNode,
  SideChatMessageOut,
  TreeResponseBody,
} from "../colcoorClient.js";
import { pathFromRootToTip } from "../treeUtils.js";

export type ConversationExplorerPayload = {
  conversation_id: string;
  tree: TreeResponseBody;
  caller_state: ConversationUserStateOut;
  active_path: GraphEventNode[];
  /** Present when the tool was asked to include side-chat; may be empty. */
  side_chat?: { messages: SideChatMessageOut[]; after_seq: number; limit: number };
};

export type BuildExplorerPayloadOptions = {
  includeSideChat: boolean;
  sideChatAfterSeq: number;
  sideChatLimit: number;
};

/**
 * Snapshot used by the MCP App tool + embedded view: main-thread tree,
 * caller active cursor, derived active path, and optional side-chat slice.
 */
export async function buildConversationExplorerPayload(
  client: ColcoorApiClient,
  conversationId: string,
  opts: BuildExplorerPayloadOptions,
): Promise<ConversationExplorerPayload> {
  const [tree, caller_state] = await Promise.all([
    client.getTree(conversationId),
    client.getCallerState(conversationId),
  ]);
  const found = tree.events.find((e) => e.id === caller_state.active_event_id);
  const active_path = found ? pathFromRootToTip(tree.events, found) : [];

  let side_chat: ConversationExplorerPayload["side_chat"];
  if (opts.includeSideChat) {
    const msgs = await client.listSideChatMessages(conversationId, opts.sideChatAfterSeq);
    const lim = Math.max(1, Math.min(200, opts.sideChatLimit));
    const tail = msgs.length > lim ? msgs.slice(msgs.length - lim) : msgs;
    side_chat = { messages: tail, after_seq: opts.sideChatAfterSeq, limit: lim };
  }

  return { conversation_id: conversationId, tree, caller_state, active_path, side_chat };
}
