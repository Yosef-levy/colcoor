/**
 * MCP prompt templates surfaced to Claude Desktop's slash-command UI.
 * Prompts are pure instructions; they do not call the backend directly.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export function registerAllPrompts(server: McpServer): void {
  server.registerPrompt(
    "colcoor_send_message",
    {
      title: "Colcoor: draft and send a user message",
      description:
        "Guide Claude through composing a Colcoor user_input event and appending it via the " +
        "`colcoor_append_user_message` tool. Pass the target conversation id and the message draft.",
      argsSchema: {
        conversation_id: z.string().describe("Target Colcoor conversation UUID."),
        draft: z.string().describe("First-draft message body."),
      },
    },
    ({ conversation_id, draft }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text:
              `I want to send the following message to Colcoor conversation ${conversation_id}.\n\n` +
              "Before sending:\n" +
              "1. Call `colcoor_get_active_path` so we can see the current branch tip.\n" +
              "2. Reword the draft if it is unclear, but ask me to confirm changes.\n" +
              "3. Then call `colcoor_append_user_message` with the finalized text.\n\n" +
              "--- DRAFT ---\n" +
              draft,
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    "colcoor_summarize_conversation",
    {
      title: "Colcoor: summarize a conversation",
      description:
        "Have Claude pull a conversation tree and notes, then produce a short summary highlighting " +
        "starred messages and any TODO-style notes.",
      argsSchema: {
        conversation_id: z.string().describe("Colcoor conversation UUID."),
      },
    },
    ({ conversation_id }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text:
              "Summarize the Colcoor conversation below.\n\n" +
              "1. Call `colcoor_get_conversation_tree` for conversation_id=" +
              conversation_id +
              ".\n" +
              "2. Call `colcoor_list_notes` for the same conversation.\n" +
              "3. Produce a Markdown summary with sections:\n" +
              "   - Overview (2–3 sentences)\n" +
              "   - Key decisions\n" +
              "   - Starred messages (link by event id)\n" +
              "   - Open TODOs (from notes containing TODO, FIXME, ?, …)\n" +
              "Quote sparingly and prefer paraphrase.",
          },
        },
      ],
    }),
  );
}
