import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { SessionTokenStore } from "../auth.js";
import { type ColcoorApiClient, isUnauthorizedColcoorApiError } from "../colcoorClient.js";
import { failFromError, ok } from "../toolHelpers.js";
import { COLCOOR_CONVERSATION_EXPLORER_URI } from "./constants.js";
import { buildConversationExplorerPayload } from "./explorerPayload.js";
import { getConversationExplorerHtml } from "./explorerHtml.js";

const UUID_REGEX =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const UUIDSchema = z.string().regex(UUID_REGEX, "must be a UUID");

export type ColcoorMcpAppDeps = {
  server: McpServer;
  client: ColcoorApiClient;
  tokens: SessionTokenStore;
};

function handleExplorerApiError(operation: string, err: unknown, tokens: SessionTokenStore) {
  if (isUnauthorizedColcoorApiError(err)) {
    tokens.clear();
    return failFromError(
      `${operation} (signed out — server rejected token; sign in again)`,
      err,
    );
  }
  return failFromError(operation, err);
}

function requireSignedIn(tokens: SessionTokenStore) {
  if (!tokens.isSignedIn()) {
    return {
      isError: true as const,
      content: [
        {
          type: "text" as const,
          text:
            "Error: Not signed in to Colcoor. Use `colcoor_request_email_login_code` + `colcoor_complete_email_login`, " +
            "or `colcoor_sign_in_with_cursor`, or set `COLCOOR_API_TOKEN` in the extension configuration. " +
            "See docs/authentication.md for details.",
        },
      ],
    };
  }
  return null;
}

/**
 * Registers the Colcoor MCP App surface: a `ui://` HTML resource plus a tool that
 * loads graph data and binds `_meta.ui.resourceUri` for Claude Desktop embedding.
 */
export function registerColcoorMcpSurface(deps: ColcoorMcpAppDeps): void {
  const { server, client, tokens } = deps;

  server.registerResource(
    "colcoor_conversation_explorer",
    COLCOOR_CONVERSATION_EXPLORER_URI,
    {
      title: "Colcoor conversation explorer (MCP App)",
      description:
        "Interactive embedded UI for main-thread navigation, active path, and side-chat preview.",
      mimeType: "text/html;profile=mcp-app",
    },
    async () => ({
      contents: [
        {
          uri: COLCOOR_CONVERSATION_EXPLORER_URI,
          mimeType: "text/html;profile=mcp-app",
          text: getConversationExplorerHtml(),
          _meta: {
            ui: {
              prefersBorder: true,
            },
          },
        },
      ],
    }),
  );

  server.registerTool(
    "colcoor_open_conversation_explorer",
    {
      title: "Colcoor: open conversation explorer (MCP App)",
      description:
        "MCP App: fetch the main-thread event graph, your active branch path, and an optional side-chat slice, " +
        "then render an interactive embedded UI in Claude Desktop. " +
        "The view calls `colcoor_set_active_event` when you click an event (updates your Colcoor cursor) and " +
        "`ui/update-model-context` so the model keeps the pinned event id in context. " +
        "Requires a host that supports MCP Apps; otherwise you still receive the structured JSON in the tool result. " +
        `UI resource: ${COLCOOR_CONVERSATION_EXPLORER_URI}.`,
      inputSchema: {
        conversation_id: UUIDSchema,
        include_side_chat: z.boolean().optional().describe("Include a capped slice of side-chat (default true)."),
        side_chat_after_seq: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe("Only fetch side-chat messages with seq greater than this (default 0)."),
        side_chat_limit: z
          .number()
          .int()
          .min(1)
          .max(200)
          .optional()
          .describe("Max side-chat messages to return from the tail of the window (default 50)."),
      },
      annotations: { readOnlyHint: true },
      _meta: {
        ui: {
          resourceUri: COLCOOR_CONVERSATION_EXPLORER_URI,
          visibility: ["model", "app"],
        },
      },
    },
    async (args) => {
      const gate = requireSignedIn(tokens);
      if (gate) return gate;
      try {
        const payload = await buildConversationExplorerPayload(client, args.conversation_id, {
          includeSideChat: args.include_side_chat ?? true,
          sideChatAfterSeq: args.side_chat_after_seq ?? 0,
          sideChatLimit: args.side_chat_limit ?? 50,
        });
        const n = payload.tree.events.length;
        const sc = payload.side_chat?.messages.length ?? 0;
        return ok(
          payload,
          `Loaded ${n} main-thread event(s)` +
            (args.include_side_chat === false ? "." : `; ${sc} side-chat row(s) in slice.`),
        );
      } catch (e) {
        return handleExplorerApiError("open conversation explorer", e, tokens);
      }
    },
  );
}
