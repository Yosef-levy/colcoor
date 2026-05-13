/**
 * Tool registrations for the Claude Desktop MCP server.
 *
 * Naming and behavior mirror the conceptual commands exposed by the
 * existing Cursor extension (packages/extension/package.json contributes
 * `colcoor.*` commands). Everything goes through the same backend API,
 * so this surface is a thin orchestration layer — no duplicated logic.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { signInWithCursorAccessToken } from "./auth.js";
import type { SessionTokenStore } from "./auth.js";
import {
  type ColcoorApiClient,
  type GraphEventNode,
  type SideChatPostBody,
  isUnauthorizedColcoorApiError,
} from "./colcoorClient.js";
import type { ColcoorExtensionConfig } from "./config.js";
import { fail, failFromError, ok, okMessage } from "./toolHelpers.js";
import { findDefaultBranchTip, pathFromRootToTip, resolveReplyParent } from "./treeUtils.js";

const PROVIDER_HINT_VALUES = ["auto", "github", "microsoft", "google"] as const;
const MEMBER_ROLE_ADD = ["editor", "viewer"] as const;
const MEMBER_ROLE_ANY = ["owner", "editor", "viewer"] as const;

const UUID_REGEX =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const UUIDSchema = z.string().regex(UUID_REGEX, "must be a UUID");

export type RegisterToolsDeps = {
  server: McpServer;
  client: ColcoorApiClient;
  tokens: SessionTokenStore;
  config: ColcoorExtensionConfig;
};

function requireSignedIn(tokens: SessionTokenStore) {
  if (!tokens.isSignedIn()) {
    return fail(
      "Not signed in to Colcoor. Run `colcoor_sign_in_with_cursor` with a Cursor / VS Code IdP token, " +
        "or set `COLCOOR_API_TOKEN` in the extension configuration. " +
        "See docs/authentication.md for details.",
    );
  }
  return null;
}

function summarizeConversation(c: {
  id: string;
  title: string | null;
  pinned: boolean;
  updated_at?: string;
  side_chat_unread_count?: number;
}): string {
  const title = (c.title ?? "").trim() || "(untitled)";
  const pin = c.pinned ? " 📌" : "";
  const u =
    c.side_chat_unread_count && c.side_chat_unread_count > 0
      ? ` • side-chat unread: ${c.side_chat_unread_count}`
      : "";
  return `• ${title}${pin} — ${c.id}${u}`;
}

function summarizeMember(m: {
  user_id: string;
  role: string;
  display_name?: string | null;
  handle?: string | null;
  email?: string | null;
}): string {
  const name = (m.display_name ?? m.handle ?? m.email ?? "").trim() || m.user_id;
  return `• ${name} (${m.role}) — ${m.user_id}`;
}

function eventOneLine(e: GraphEventNode): string {
  const role =
    e.kind === "user_input" ? "USER" : e.kind === "assistant_output" ? "LLM" : e.kind.toUpperCase();
  const body = (e.content_text ?? "").replace(/\s+/g, " ").slice(0, 120);
  const star = e.starred ? " ★" : "";
  const cp = e.checkpoint_label ? ` [${e.checkpoint_label}]` : "";
  return `[${role}${star}${cp}] ${e.id} — ${body}`;
}

export function registerAllTools(deps: RegisterToolsDeps): void {
  registerHealthAndAuthTools(deps);
  registerProfileTools(deps);
  registerConversationTools(deps);
  registerMemberTools(deps);
  registerTreeTools(deps);
  registerMessagingTools(deps);
  registerNoteTools(deps);
  registerSideChatTools(deps);
}

// ---------------------------------------------------------------------------
// Health + auth
// ---------------------------------------------------------------------------

function registerHealthAndAuthTools({ server, client, tokens, config }: RegisterToolsDeps): void {
  server.registerTool(
    "colcoor_health",
    {
      title: "Colcoor: backend health",
      description:
        "Probe GET /api/v1/health on the configured Colcoor backend. No authentication required. " +
        "Use this to verify the configured backend URL before signing in.",
      inputSchema: {},
    },
    async () => {
      try {
        const body = await client.getHealth();
        return ok(
          { backend_base_url: config.backendBaseUrl, health: body },
          `Colcoor backend at ${config.backendBaseUrl} reachable.`,
        );
      } catch (e) {
        return failFromError("health", e);
      }
    },
  );

  server.registerTool(
    "colcoor_session_status",
    {
      title: "Colcoor: session status",
      description:
        "Report whether the MCP server currently has a Colcoor API JWT. " +
        "Does not contact the backend.",
      inputSchema: {},
    },
    async () => {
      return ok(
        { signed_in: tokens.isSignedIn(), backend_base_url: config.backendBaseUrl },
        tokens.isSignedIn() ? "Signed in to Colcoor." : "Not signed in to Colcoor.",
      );
    },
  );

  server.registerTool(
    "colcoor_sign_in_with_cursor",
    {
      title: "Colcoor: sign in (Cursor IdP token)",
      description:
        "Exchange a Cursor / VS Code identity-provider access token for a Colcoor API JWT " +
        "(POST /api/v1/auth/cursor; see docs/authentication.md). The resulting JWT is held " +
        "in memory only for the lifetime of this MCP server process.",
      inputSchema: {
        cursor_access_token: z
          .string()
          .min(1, "cursor_access_token is required")
          .describe("Access token obtained via VS Code/Cursor authentication.getSession."),
        provider_hint: z
          .enum(PROVIDER_HINT_VALUES)
          .optional()
          .describe("Identity provider hint. Defaults to 'auto'."),
      },
    },
    async (args) => {
      try {
        await signInWithCursorAccessToken(
          client,
          tokens,
          args.cursor_access_token,
          args.provider_hint ?? "auto",
        );
        return okMessage("Signed in to Colcoor.");
      } catch (e) {
        return failFromError("sign in", e);
      }
    },
  );

  server.registerTool(
    "colcoor_set_api_token",
    {
      title: "Colcoor: set API token directly",
      description:
        "Replace the in-memory Colcoor API JWT. Useful when you obtained a JWT through another " +
        "channel (e.g. the Cursor extension's SecretStorage). The new value is not persisted; " +
        "for persistence configure `COLCOOR_API_TOKEN` in Claude Desktop's extension settings.",
      inputSchema: {
        api_token: z.string().min(1, "api_token is required"),
      },
    },
    async (args) => {
      tokens.set(args.api_token);
      return okMessage("Colcoor API token updated.");
    },
  );

  server.registerTool(
    "colcoor_sign_out",
    {
      title: "Colcoor: sign out",
      description: "Forget the in-memory Colcoor API JWT (local sign-out only).",
      inputSchema: {},
    },
    async () => {
      tokens.clear();
      return okMessage("Cleared Colcoor session.");
    },
  );
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

function registerProfileTools({ server, client, tokens }: RegisterToolsDeps): void {
  server.registerTool(
    "colcoor_who_am_i",
    {
      title: "Colcoor: who am I",
      description: "Fetch the caller's Colcoor profile (GET /api/v1/me).",
      inputSchema: {},
    },
    async () => {
      const gate = requireSignedIn(tokens);
      if (gate) return gate;
      try {
        const me = await client.getMe();
        return ok(me, `Signed in as ${me.display_name || me.email} (${me.id}).`);
      } catch (e) {
        return handleApiError("who am I", e, tokens);
      }
    },
  );

  server.registerTool(
    "colcoor_update_profile",
    {
      title: "Colcoor: update profile",
      description:
        "Update the caller's display name and/or avatar URL (PATCH /api/v1/me). " +
        "Pass at least one field; pass `null` for `avatar_url` to clear it.",
      inputSchema: {
        display_name: z.string().min(1).max(120).optional(),
        avatar_url: z.string().url().nullable().optional(),
      },
    },
    async (args) => {
      const gate = requireSignedIn(tokens);
      if (gate) return gate;
      if (args.display_name === undefined && args.avatar_url === undefined) {
        return fail("Pass at least one of `display_name` or `avatar_url`.");
      }
      try {
        const body: { display_name?: string; avatar_url?: string | null } = {};
        if (args.display_name !== undefined) body.display_name = args.display_name;
        if (args.avatar_url !== undefined) body.avatar_url = args.avatar_url;
        const me = await client.patchMe(body);
        return ok(me, "Profile updated.");
      } catch (e) {
        return handleApiError("update profile", e, tokens);
      }
    },
  );
}

// ---------------------------------------------------------------------------
// Conversations
// ---------------------------------------------------------------------------

function registerConversationTools({ server, client, tokens }: RegisterToolsDeps): void {
  server.registerTool(
    "colcoor_list_conversations",
    {
      title: "Colcoor: list conversations",
      description:
        "List conversations the caller is a member of (GET /api/v1/conversations). " +
        "Ordered server-side: pinned first, then most recently updated.",
      inputSchema: {},
    },
    async () => {
      const gate = requireSignedIn(tokens);
      if (gate) return gate;
      try {
        const rows = await client.listConversations();
        const summary =
          rows.length === 0
            ? "No conversations."
            : `${rows.length} conversation(s):\n${rows.map(summarizeConversation).join("\n")}`;
        return ok({ conversations: rows }, summary);
      } catch (e) {
        return handleApiError("list conversations", e, tokens);
      }
    },
  );

  server.registerTool(
    "colcoor_create_conversation",
    {
      title: "Colcoor: create conversation",
      description:
        "Create a new conversation (POST /api/v1/conversations). Caller becomes the sole owner. " +
        "Optional title; pass null/blank for an untitled conversation.",
      inputSchema: {
        title: z.string().nullable().optional(),
      },
    },
    async (args) => {
      const gate = requireSignedIn(tokens);
      if (gate) return gate;
      try {
        const title = typeof args.title === "string" ? args.title.trim() || null : null;
        const conv = await client.createConversation({ title });
        return ok(conv, `Created conversation "${conv.title ?? "(untitled)"}" (${conv.id}).`);
      } catch (e) {
        return handleApiError("create conversation", e, tokens);
      }
    },
  );

  server.registerTool(
    "colcoor_rename_conversation",
    {
      title: "Colcoor: rename conversation",
      description:
        "Update the shared title (owner/editor; PATCH /api/v1/conversations/{id}). " +
        "Pass null to clear the title.",
      inputSchema: {
        conversation_id: UUIDSchema,
        title: z.string().nullable(),
      },
    },
    async (args) => {
      const gate = requireSignedIn(tokens);
      if (gate) return gate;
      try {
        const title = typeof args.title === "string" ? args.title.trim() || null : null;
        const c = await client.patchConversation(args.conversation_id, { title });
        return ok(c, `Renamed to "${c.title ?? "(untitled)"}".`);
      } catch (e) {
        return handleApiError("rename conversation", e, tokens);
      }
    },
  );

  server.registerTool(
    "colcoor_set_conversation_pinned",
    {
      title: "Colcoor: pin/unpin conversation",
      description:
        "Update the caller's per-user pin state on a conversation (PATCH /api/v1/conversations/{id}).",
      inputSchema: {
        conversation_id: UUIDSchema,
        pinned: z.boolean(),
      },
    },
    async (args) => {
      const gate = requireSignedIn(tokens);
      if (gate) return gate;
      try {
        const c = await client.patchConversation(args.conversation_id, {
          pinned: args.pinned,
        });
        return ok(c, args.pinned ? "Pinned." : "Unpinned.");
      } catch (e) {
        return handleApiError("update pinned state", e, tokens);
      }
    },
  );

  server.registerTool(
    "colcoor_delete_conversation",
    {
      title: "Colcoor: delete conversation (soft)",
      description:
        "Owner-only soft-delete of an entire conversation graph (DELETE /api/v1/conversations/{id}). " +
        "Returns a `deletion_group_id` you can pass to `colcoor_undo_event_delete` within the server's " +
        "undo window, or to `colcoor_restore_deleted_conversation` afterwards.",
      inputSchema: {
        conversation_id: UUIDSchema,
      },
    },
    async (args) => {
      const gate = requireSignedIn(tokens);
      if (gate) return gate;
      try {
        const r = await client.deleteConversation(args.conversation_id);
        return ok(r, `Soft-deleted ${r.deleted_count} event(s).`);
      } catch (e) {
        return handleApiError("delete conversation", e, tokens);
      }
    },
  );

  server.registerTool(
    "colcoor_restore_deleted_conversation",
    {
      title: "Colcoor: restore deleted conversation",
      description:
        "Owner/editor: restore a soft-deleted conversation graph " +
        "(POST /api/v1/conversations/{id}/restore-deleted).",
      inputSchema: {
        conversation_id: UUIDSchema,
      },
    },
    async (args) => {
      const gate = requireSignedIn(tokens);
      if (gate) return gate;
      try {
        const r = await client.restoreDeletedConversation(args.conversation_id);
        return ok(r, `Restored ${r.restored_count} event(s).`);
      } catch (e) {
        return handleApiError("restore conversation", e, tokens);
      }
    },
  );
}

// ---------------------------------------------------------------------------
// Members
// ---------------------------------------------------------------------------

function registerMemberTools({ server, client, tokens }: RegisterToolsDeps): void {
  server.registerTool(
    "colcoor_list_members",
    {
      title: "Colcoor: list conversation members",
      description: "List members of a conversation (GET …/members).",
      inputSchema: { conversation_id: UUIDSchema },
    },
    async (args) => {
      const gate = requireSignedIn(tokens);
      if (gate) return gate;
      try {
        const members = await client.listConversationMembers(args.conversation_id);
        const summary =
          members.length === 0
            ? "No members."
            : `${members.length} member(s):\n${members.map(summarizeMember).join("\n")}`;
        return ok({ members }, summary);
      } catch (e) {
        return handleApiError("list members", e, tokens);
      }
    },
  );

  server.registerTool(
    "colcoor_search_member_invite_candidates",
    {
      title: "Colcoor: search invite candidates",
      description:
        "Owner/editor: search existing Colcoor accounts to invite by UUID, full email, or handle " +
        "(GET …/member-invite-search). Already-members are excluded.",
      inputSchema: {
        conversation_id: UUIDSchema,
        q: z.string().min(1).max(320),
      },
    },
    async (args) => {
      const gate = requireSignedIn(tokens);
      if (gate) return gate;
      try {
        const rows = await client.searchConversationMemberInviteCandidates(
          args.conversation_id,
          args.q,
        );
        const summary =
          rows.length === 0
            ? "No matching candidates."
            : `${rows.length} candidate(s):\n${rows
                .map((r) => `• ${r.display_name ?? r.handle ?? r.email} — ${r.user_id}`)
                .join("\n")}`;
        return ok({ candidates: rows }, summary);
      } catch (e) {
        return handleApiError("search invite candidates", e, tokens);
      }
    },
  );

  server.registerTool(
    "colcoor_add_member",
    {
      title: "Colcoor: add member",
      description:
        "Owner/editor: add a member (POST …/members). Cannot create a second owner here — " +
        "use `colcoor_change_member_role` instead.",
      inputSchema: {
        conversation_id: UUIDSchema,
        user_id: UUIDSchema,
        role: z.enum(MEMBER_ROLE_ADD),
      },
    },
    async (args) => {
      const gate = requireSignedIn(tokens);
      if (gate) return gate;
      try {
        const m = await client.addConversationMember(args.conversation_id, {
          user_id: args.user_id,
          role: args.role,
        });
        return ok(m, `Added ${m.user_id} as ${m.role}.`);
      } catch (e) {
        return handleApiError("add member", e, tokens);
      }
    },
  );

  server.registerTool(
    "colcoor_change_member_role",
    {
      title: "Colcoor: change member role",
      description:
        "Owner-only: change a member's role (PATCH …/members/{user_id}). Setting `role` to `owner` " +
        "transfers ownership.",
      inputSchema: {
        conversation_id: UUIDSchema,
        user_id: UUIDSchema,
        role: z.enum(MEMBER_ROLE_ANY),
      },
    },
    async (args) => {
      const gate = requireSignedIn(tokens);
      if (gate) return gate;
      try {
        const m = await client.patchConversationMemberRole(
          args.conversation_id,
          args.user_id,
          { role: args.role },
        );
        return ok(m, `Updated ${m.user_id} → ${m.role}.`);
      } catch (e) {
        return handleApiError("change member role", e, tokens);
      }
    },
  );

  server.registerTool(
    "colcoor_remove_member",
    {
      title: "Colcoor: remove member",
      description: "Owner-only: remove a non-owner member (DELETE …/members/{user_id}).",
      inputSchema: {
        conversation_id: UUIDSchema,
        user_id: UUIDSchema,
      },
    },
    async (args) => {
      const gate = requireSignedIn(tokens);
      if (gate) return gate;
      try {
        await client.deleteConversationMember(args.conversation_id, args.user_id);
        return okMessage(`Removed member ${args.user_id}.`);
      } catch (e) {
        return handleApiError("remove member", e, tokens);
      }
    },
  );
}

// ---------------------------------------------------------------------------
// Tree / active cursor
// ---------------------------------------------------------------------------

function registerTreeTools({ server, client, tokens }: RegisterToolsDeps): void {
  server.registerTool(
    "colcoor_get_conversation_tree",
    {
      title: "Colcoor: get conversation tree",
      description:
        "Return the full main-thread event graph for a conversation (GET …/tree). " +
        "Includes user_input and assistant_output nodes, stars, notes counts, and checkpoint labels.",
      inputSchema: { conversation_id: UUIDSchema },
    },
    async (args) => {
      const gate = requireSignedIn(tokens);
      if (gate) return gate;
      try {
        const tree = await client.getTree(args.conversation_id);
        const summary = `${tree.events.length} event(s).`;
        return ok(tree, summary);
      } catch (e) {
        return handleApiError("load tree", e, tokens);
      }
    },
  );

  server.registerTool(
    "colcoor_get_active_path",
    {
      title: "Colcoor: get active branch path",
      description:
        "Read the caller's active node (GET …/caller-state) and return the root → active path. " +
        "Useful before appending a reply so you can confirm where the next user_input will attach.",
      inputSchema: { conversation_id: UUIDSchema },
    },
    async (args) => {
      const gate = requireSignedIn(tokens);
      if (gate) return gate;
      try {
        const [state, tree] = await Promise.all([
          client.getCallerState(args.conversation_id),
          client.getTree(args.conversation_id),
        ]);
        const found = tree.events.find((e) => e.id === state.active_event_id);
        if (!found) {
          return ok({ caller_state: state, path: [] }, "Active node is not visible in the tree.");
        }
        const path = pathFromRootToTip(tree.events, found);
        const summary =
          `Active node: ${state.active_event_id}\n` +
          `Path (${path.length}):\n` +
          path.map(eventOneLine).join("\n");
        return ok({ caller_state: state, path }, summary);
      } catch (e) {
        return handleApiError("get active path", e, tokens);
      }
    },
  );

  server.registerTool(
    "colcoor_set_active_event",
    {
      title: "Colcoor: set active event",
      description:
        "Pin the caller's active node to a specific event (POST …/active). Optionally signal " +
        "that the next agent run needs a fresh context rebuild.",
      inputSchema: {
        conversation_id: UUIDSchema,
        active_event_id: UUIDSchema,
        needs_context_rebuild: z.boolean().optional(),
      },
    },
    async (args) => {
      const gate = requireSignedIn(tokens);
      if (gate) return gate;
      try {
        const r = await client.setConversationActive(args.conversation_id, {
          active_event_id: args.active_event_id,
          needs_context_rebuild: args.needs_context_rebuild ?? false,
        });
        return ok(r, `Active event set to ${r.active_event_id}.`);
      } catch (e) {
        return handleApiError("set active event", e, tokens);
      }
    },
  );

  server.registerTool(
    "colcoor_star_event",
    {
      title: "Colcoor: star event",
      description: "Idempotent star on a visible event (PUT …/events/{id}/star).",
      inputSchema: {
        conversation_id: UUIDSchema,
        event_id: UUIDSchema,
      },
    },
    async (args) => {
      const gate = requireSignedIn(tokens);
      if (gate) return gate;
      try {
        await client.putStar(args.conversation_id, args.event_id);
        return okMessage(`Starred ${args.event_id}.`);
      } catch (e) {
        return handleApiError("star event", e, tokens);
      }
    },
  );

  server.registerTool(
    "colcoor_unstar_event",
    {
      title: "Colcoor: unstar event",
      description: "Remove a star from an event (DELETE …/events/{id}/star).",
      inputSchema: {
        conversation_id: UUIDSchema,
        event_id: UUIDSchema,
      },
    },
    async (args) => {
      const gate = requireSignedIn(tokens);
      if (gate) return gate;
      try {
        await client.deleteStar(args.conversation_id, args.event_id);
        return okMessage(`Unstarred ${args.event_id}.`);
      } catch (e) {
        return handleApiError("unstar event", e, tokens);
      }
    },
  );

  server.registerTool(
    "colcoor_delete_event_subtree",
    {
      title: "Colcoor: delete event branch (soft)",
      description:
        "Soft-delete an event and all replies under it (DELETE …/events/{id}). " +
        "Returns a `deletion_group_id` for `colcoor_undo_event_delete` within the undo window.",
      inputSchema: {
        conversation_id: UUIDSchema,
        event_id: UUIDSchema,
      },
    },
    async (args) => {
      const gate = requireSignedIn(tokens);
      if (gate) return gate;
      try {
        const r = await client.deleteEventSubtree(args.conversation_id, args.event_id);
        return ok(r, `Soft-deleted ${r.deleted_count} event(s).`);
      } catch (e) {
        return handleApiError("delete event subtree", e, tokens);
      }
    },
  );

  server.registerTool(
    "colcoor_undo_event_delete",
    {
      title: "Colcoor: undo event delete",
      description:
        "Undo a recent soft-delete batch (POST …/events/undo-delete) within the server's undo window.",
      inputSchema: {
        conversation_id: UUIDSchema,
        deletion_group_id: UUIDSchema,
      },
    },
    async (args) => {
      const gate = requireSignedIn(tokens);
      if (gate) return gate;
      try {
        const r = await client.undoEventDeletion(args.conversation_id, args.deletion_group_id);
        return ok(r, `Restored ${r.restored_count} event(s).`);
      } catch (e) {
        return handleApiError("undo event delete", e, tokens);
      }
    },
  );

  server.registerTool(
    "colcoor_restore_event_subtree",
    {
      title: "Colcoor: restore event branch",
      description:
        "Owner/editor: restore a soft-deleted branch by its anchor event id (POST …/restore-subtree).",
      inputSchema: {
        conversation_id: UUIDSchema,
        event_id: UUIDSchema,
      },
    },
    async (args) => {
      const gate = requireSignedIn(tokens);
      if (gate) return gate;
      try {
        const r = await client.restoreEventSubtree(args.conversation_id, args.event_id);
        return ok(r, `Restored ${r.restored_count} event(s).`);
      } catch (e) {
        return handleApiError("restore event subtree", e, tokens);
      }
    },
  );

  server.registerTool(
    "colcoor_set_event_checkpoint_label",
    {
      title: "Colcoor: set/clear event checkpoint label",
      description:
        "Set a display-only checkpoint label on an event, or pass null to clear it " +
        "(PATCH …/events/{id}/checkpoint-label).",
      inputSchema: {
        conversation_id: UUIDSchema,
        event_id: UUIDSchema,
        checkpoint_label: z.string().max(256).nullable(),
      },
    },
    async (args) => {
      const gate = requireSignedIn(tokens);
      if (gate) return gate;
      try {
        await client.patchEventCheckpointLabel(
          args.conversation_id,
          args.event_id,
          args.checkpoint_label,
        );
        return okMessage(
          args.checkpoint_label
            ? `Set checkpoint label "${args.checkpoint_label}" on ${args.event_id}.`
            : `Cleared checkpoint label on ${args.event_id}.`,
        );
      } catch (e) {
        return handleApiError("patch event checkpoint label", e, tokens);
      }
    },
  );
}

// ---------------------------------------------------------------------------
// Messaging (append user_input / assistant_output)
// ---------------------------------------------------------------------------

function registerMessagingTools({ server, client, tokens, config }: RegisterToolsDeps): void {
  server.registerTool(
    "colcoor_append_user_message",
    {
      title: "Colcoor: send a user message",
      description:
        "Append a `user_input` event under the requested reply parent (POST …/append-event with " +
        "kind=user_input). When `reply_parent_event_id` is omitted, attaches to the default branch tip. " +
        "Note: the Claude Desktop extension does not run the Cursor CLI agent locally — to get an " +
        "assistant reply, the conversation owner or another agent must append an `assistant_output` " +
        "event under the returned id (e.g. via the Cursor extension or `colcoor_append_assistant_message`).",
      inputSchema: {
        conversation_id: UUIDSchema,
        content: z.string().describe("User message body (will be trimmed; non-empty)."),
        reply_parent_event_id: UUIDSchema.optional(),
        private_branch: z.boolean().optional(),
        checkpoint_label: z.string().max(256).optional(),
      },
    },
    async (args) => {
      const gate = requireSignedIn(tokens);
      if (gate) return gate;
      const content = (args.content ?? "").trim();
      if (!content) {
        return fail("`content` is empty after trimming.");
      }
      try {
        const { events } = await client.getTree(args.conversation_id);
        if (events.length === 0) {
          return fail("conversation has no events (server returned empty graph).");
        }
        const parent = resolveReplyParent(events, args.reply_parent_event_id ?? null);
        const r = await client.appendEvent(args.conversation_id, {
          kind: "user_input",
          parent_event_id: parent.id,
          content,
          author: "end_user",
          private_branch: args.private_branch ?? false,
          checkpoint_label: args.checkpoint_label ?? null,
        });
        return ok(
          {
            event_id: r.id,
            parent_event_id: parent.id,
            private_branch: args.private_branch ?? false,
          },
          `Appended user_input ${r.id} under ${parent.id}.`,
        );
      } catch (e) {
        return handleApiError("append user message", e, tokens);
      }
    },
  );

  server.registerTool(
    "colcoor_append_assistant_message",
    {
      title: "Colcoor: append an assistant reply",
      description:
        "Append an `assistant_output` event (POST …/append-event with kind=assistant_output) under a " +
        "specific `parent_event_id`. The `author` field defaults to the configured agent author " +
        "(env COLCOOR_AGENT_AUTHOR, default \"claude_desktop\"). Use this when Claude is producing a " +
        "reply that should be persisted into the Colcoor main thread.",
      inputSchema: {
        conversation_id: UUIDSchema,
        parent_event_id: UUIDSchema.describe(
          "Usually the user_input id this reply answers; must be visible to the caller.",
        ),
        content: z.string().describe("Assistant reply body (will be trimmed)."),
        author: z.string().min(1).max(64).optional(),
        content_json: z
          .record(z.unknown())
          .optional()
          .describe(
            "Optional structured payload (e.g. { colcoor_agent_trace: { version: 1, entries: [...] } }).",
          ),
        checkpoint_label: z.string().max(256).optional(),
      },
    },
    async (args) => {
      const gate = requireSignedIn(tokens);
      if (gate) return gate;
      const content = (args.content ?? "").trim();
      if (!content) {
        return fail("`content` is empty after trimming.");
      }
      try {
        const r = await client.appendEvent(args.conversation_id, {
          kind: "assistant_output",
          parent_event_id: args.parent_event_id,
          content,
          author: args.author ?? config.agentAuthor,
          private_branch: false,
          content_json: args.content_json ?? null,
          checkpoint_label: args.checkpoint_label ?? null,
        });
        return ok(
          { event_id: r.id, parent_event_id: args.parent_event_id },
          `Appended assistant_output ${r.id} under ${args.parent_event_id}.`,
        );
      } catch (e) {
        return handleApiError("append assistant message", e, tokens);
      }
    },
  );

  server.registerTool(
    "colcoor_get_default_branch_tip",
    {
      title: "Colcoor: default branch tip",
      description:
        "Walk the default branch from root to its newest leaf and return that node — i.e. the event " +
        "the next `user_input` would attach to when no explicit `reply_parent_event_id` is given.",
      inputSchema: { conversation_id: UUIDSchema },
    },
    async (args) => {
      const gate = requireSignedIn(tokens);
      if (gate) return gate;
      try {
        const { events } = await client.getTree(args.conversation_id);
        if (events.length === 0) {
          return fail("conversation has no events.");
        }
        const tip = findDefaultBranchTip(events);
        return ok({ event: tip }, `Default branch tip: ${tip.id}`);
      } catch (e) {
        return handleApiError("find default branch tip", e, tokens);
      }
    },
  );
}

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------

function registerNoteTools({ server, client, tokens }: RegisterToolsDeps): void {
  server.registerTool(
    "colcoor_list_notes",
    {
      title: "Colcoor: list notes",
      description: "List all notes on events visible to the caller in a conversation (GET …/notes).",
      inputSchema: { conversation_id: UUIDSchema },
    },
    async (args) => {
      const gate = requireSignedIn(tokens);
      if (gate) return gate;
      try {
        const notes = await client.listNotes(args.conversation_id);
        const summary = `${notes.length} note(s).`;
        return ok({ notes }, summary);
      } catch (e) {
        return handleApiError("list notes", e, tokens);
      }
    },
  );

  server.registerTool(
    "colcoor_create_note",
    {
      title: "Colcoor: create note",
      description:
        "Attach a note to an event (POST …/notes). The note is visible to all conversation members.",
      inputSchema: {
        conversation_id: UUIDSchema,
        event_id: UUIDSchema,
        content: z.string().min(1),
      },
    },
    async (args) => {
      const gate = requireSignedIn(tokens);
      if (gate) return gate;
      const content = (args.content ?? "").trim();
      if (!content) {
        return fail("`content` is empty after trimming.");
      }
      try {
        const n = await client.createNote(args.conversation_id, {
          event_id: args.event_id,
          content,
        });
        return ok(n, `Created note ${n.id} on event ${n.event_id}.`);
      } catch (e) {
        return handleApiError("create note", e, tokens);
      }
    },
  );

  server.registerTool(
    "colcoor_update_note",
    {
      title: "Colcoor: update note",
      description: "Update a note's content (PATCH …/notes/{id}).",
      inputSchema: {
        conversation_id: UUIDSchema,
        note_id: UUIDSchema,
        content: z.string().min(1),
      },
    },
    async (args) => {
      const gate = requireSignedIn(tokens);
      if (gate) return gate;
      try {
        const n = await client.patchNote(args.conversation_id, args.note_id, {
          content: args.content,
        });
        return ok(n, `Updated note ${n.id}.`);
      } catch (e) {
        return handleApiError("update note", e, tokens);
      }
    },
  );

  server.registerTool(
    "colcoor_delete_note",
    {
      title: "Colcoor: delete note",
      description: "Delete a note (DELETE …/notes/{id}).",
      inputSchema: {
        conversation_id: UUIDSchema,
        note_id: UUIDSchema,
      },
    },
    async (args) => {
      const gate = requireSignedIn(tokens);
      if (gate) return gate;
      try {
        await client.deleteNote(args.conversation_id, args.note_id);
        return okMessage(`Deleted note ${args.note_id}.`);
      } catch (e) {
        return handleApiError("delete note", e, tokens);
      }
    },
  );
}

// ---------------------------------------------------------------------------
// Side chat
// ---------------------------------------------------------------------------

function registerSideChatTools({ server, client, tokens }: RegisterToolsDeps): void {
  server.registerTool(
    "colcoor_list_side_chat_messages",
    {
      title: "Colcoor: list side-chat messages",
      description:
        "Return side-chat messages with seq > after_seq, ascending (GET …/side-chat/messages). " +
        "Includes soft-deleted rows as tombstones with `deleted_at` set.",
      inputSchema: {
        conversation_id: UUIDSchema,
        after_seq: z.number().int().min(0).optional(),
      },
    },
    async (args) => {
      const gate = requireSignedIn(tokens);
      if (gate) return gate;
      try {
        const rows = await client.listSideChatMessages(
          args.conversation_id,
          args.after_seq ?? 0,
        );
        return ok({ messages: rows }, `${rows.length} side-chat message(s).`);
      } catch (e) {
        return handleApiError("list side-chat messages", e, tokens);
      }
    },
  );

  server.registerTool(
    "colcoor_post_side_chat_message",
    {
      title: "Colcoor: post side-chat message",
      description:
        "Post a `user` side-chat message (POST …/side-chat/messages). Supports references to " +
        "main-thread events, notes, and other side-chat messages.",
      inputSchema: {
        conversation_id: UUIDSchema,
        body: z.string().min(1),
        referenced_event_id: UUIDSchema.nullable().optional(),
        referenced_note_id: UUIDSchema.nullable().optional(),
        referenced_side_chat_message_id: UUIDSchema.nullable().optional(),
      },
    },
    async (args) => {
      const gate = requireSignedIn(tokens);
      if (gate) return gate;
      const body = (args.body ?? "").trim();
      if (!body) {
        return fail("`body` is empty after trimming.");
      }
      try {
        const payload: SideChatPostBody = { kind: "user", body };
        if (args.referenced_event_id !== undefined) {
          payload.referenced_event_id = args.referenced_event_id;
        }
        if (args.referenced_note_id !== undefined) {
          payload.referenced_note_id = args.referenced_note_id;
        }
        if (args.referenced_side_chat_message_id !== undefined) {
          payload.referenced_side_chat_message_id = args.referenced_side_chat_message_id;
        }
        const r = await client.postSideChatMessage(args.conversation_id, payload);
        return ok(r, `Posted side-chat message ${r.id} (seq ${r.seq}).`);
      } catch (e) {
        return handleApiError("post side-chat message", e, tokens);
      }
    },
  );

  server.registerTool(
    "colcoor_edit_side_chat_message",
    {
      title: "Colcoor: edit side-chat message",
      description: "Edit a side-chat message body (PATCH …/side-chat/messages/{id}).",
      inputSchema: {
        conversation_id: UUIDSchema,
        message_id: UUIDSchema,
        body: z.string().min(1),
      },
    },
    async (args) => {
      const gate = requireSignedIn(tokens);
      if (gate) return gate;
      try {
        const r = await client.patchSideChatMessage(args.conversation_id, args.message_id, {
          body: args.body,
        });
        return ok(r, `Edited side-chat message ${r.id}.`);
      } catch (e) {
        return handleApiError("edit side-chat message", e, tokens);
      }
    },
  );

  server.registerTool(
    "colcoor_delete_side_chat_message",
    {
      title: "Colcoor: delete side-chat message",
      description: "Soft-delete a side-chat message (DELETE …/side-chat/messages/{id}).",
      inputSchema: {
        conversation_id: UUIDSchema,
        message_id: UUIDSchema,
      },
    },
    async (args) => {
      const gate = requireSignedIn(tokens);
      if (gate) return gate;
      try {
        const r = await client.deleteSideChatMessage(args.conversation_id, args.message_id);
        return ok(r, `Soft-deleted side-chat message ${args.message_id}.`);
      } catch (e) {
        return handleApiError("delete side-chat message", e, tokens);
      }
    },
  );

  server.registerTool(
    "colcoor_mark_side_chat_read",
    {
      title: "Colcoor: mark side-chat read",
      description:
        "Move the caller's side-chat read cursor to a given seq (PATCH …/side-chat/read). " +
        "Returns 204; consider `colcoor_list_side_chat_messages` first to discover the latest seq.",
      inputSchema: {
        conversation_id: UUIDSchema,
        last_read_seq: z.number().int().min(0),
      },
    },
    async (args) => {
      const gate = requireSignedIn(tokens);
      if (gate) return gate;
      try {
        await client.patchSideChatRead(args.conversation_id, args.last_read_seq);
        return okMessage(`Side-chat read cursor set to ${args.last_read_seq}.`);
      } catch (e) {
        return handleApiError("mark side-chat read", e, tokens);
      }
    },
  );
}

// ---------------------------------------------------------------------------
// Error helpers
// ---------------------------------------------------------------------------

function handleApiError(operation: string, err: unknown, tokens: SessionTokenStore) {
  if (isUnauthorizedColcoorApiError(err)) {
    // Mirror packages/extension behavior: clear stored token on 401 so re-auth works cleanly.
    tokens.clear();
    return failFromError(
      `${operation} (signed out — server rejected token; sign in again)`,
      err,
    );
  }
  return failFromError(operation, err);
}
