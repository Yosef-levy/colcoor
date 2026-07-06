import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import type {
  AppendEventBody,
  AppendEventResponse,
  AuthResponseBody,
  ColcoorClient,
  ConversationListCreateBody,
  ConversationListItemCreateBody,
  ConversationListItemOut,
  ConversationListItemPatchBody,
  ConversationListOut,
  ConversationListPatchBody,
  ConversationListsBundleOut,
  ConversationMember,
  ConversationSummary,
  ConversationUserStateOut,
  EventSubtreeSoftDeleteOut,
  GraphEventNode,
  MeOut,
  MePatchBody,
  MemberInviteSearchCandidate,
  NoteOut,
  RestoreSubtreeOut,
  SetConversationActiveBody,
  SideChatMessageOut,
  TreeResponseBody,
} from "../api/client";

/**
 * Offline single-user store: all conversation data lives as JSON/JSONL files under
 * ``<workspaceRoot>/.colcoor``. Because it roots at the current workspace, switching
 * workspaces surfaces only the conversations started there. Collaboration features
 * (members, side chat) are single-user no-ops. See the offline standalone plan.
 */

/** Stored event row: a superset of {@link GraphEventNode} plus soft-delete/idempotency bookkeeping. */
type StoredEvent = {
  id: string;
  conversation_id: string;
  parent_event_id: string | null;
  kind: string;
  actor_type: string;
  actor_user_id: string | null;
  content_text: string | null;
  content_json?: Record<string, unknown> | null;
  visible_to: string | null;
  checkpoint_label?: string | null;
  starred?: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  deletion_group_id: string | null;
  idempotency_key?: string;
};

type ConvMeta = {
  id: string;
  title: string | null;
  metadata_json: Record<string, unknown> | null;
  pinned: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  active_event_id: string;
  needs_context_rebuild: boolean;
  side_chat_last_read_seq: number;
};

type StoredNote = {
  id: string;
  event_id: string;
  author_user_id: string;
  content: string;
  created_at: string;
  updated_at: string;
};

type StoredImageIndexEntry = {
  id: string;
  filename: string;
  mime_type: string;
  byte_size: number;
};

type LocalProfile = {
  id: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
  handle: string | null;
};

const DEFAULT_PROFILE: LocalProfile = {
  id: "local-user",
  email: "local@localhost",
  display_name: "You",
  avatar_url: null,
  handle: null,
};

function nowIso(): string {
  return new Date().toISOString();
}

function offlineUnsupported(feature: string): Error {
  return new Error(`${feature} is not available in Colcoor offline (local) mode.`);
}

function extForMime(mimeType: string): string {
  switch (mimeType) {
    case "image/png":
      return "png";
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    default:
      return "img";
  }
}

export class LocalConversationStore implements ColcoorClient {
  private readonly workspaceRoot: string;
  private profileCache: LocalProfile | null = null;

  constructor(workspaceRoot: string) {
    // Never throw at construction: offline mode must stay active (and never fall back to
    // the backend) even if no folder is open yet. The clear error is deferred to first use.
    this.workspaceRoot = workspaceRoot.trim();
  }

  /** Absolute `.colcoor` root; throws a clear error only when a data operation needs it. */
  private get baseDir(): string {
    if (!this.workspaceRoot) {
      throw new Error("Colcoor offline mode requires an open workspace folder.");
    }
    return path.join(this.workspaceRoot, ".colcoor");
  }

  // ---------------------------------------------------------------------------
  // Filesystem helpers
  // ---------------------------------------------------------------------------

  private conversationsDir(): string {
    return path.join(this.baseDir, "conversations");
  }

  private convDir(conversationId: string): string {
    return path.join(this.conversationsDir(), conversationId);
  }

  private metaPath(conversationId: string): string {
    return path.join(this.convDir(conversationId), "meta.json");
  }

  private eventsPath(conversationId: string): string {
    return path.join(this.convDir(conversationId), "events.jsonl");
  }

  private notesPath(conversationId: string): string {
    return path.join(this.convDir(conversationId), "notes.jsonl");
  }

  private listsPath(conversationId: string): string {
    return path.join(this.convDir(conversationId), "lists.json");
  }

  private imagesDir(conversationId: string): string {
    return path.join(this.convDir(conversationId), "images");
  }

  private imagesIndexPath(conversationId: string): string {
    return path.join(this.imagesDir(conversationId), "index.json");
  }

  private profilePath(): string {
    return path.join(this.baseDir, "profile.json");
  }

  private async readJson<T>(file: string, fallback: T): Promise<T> {
    try {
      const raw = await fs.readFile(file, "utf8");
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }

  private async writeJson(file: string, value: unknown): Promise<void> {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  }

  private async readJsonl<T>(file: string): Promise<T[]> {
    let raw: string;
    try {
      raw = await fs.readFile(file, "utf8");
    } catch {
      return [];
    }
    const out: T[] = [];
    for (const line of raw.split("\n")) {
      const t = line.trim();
      if (!t) {
        continue;
      }
      try {
        out.push(JSON.parse(t) as T);
      } catch {
        // Skip a torn/partial final line (e.g. crash mid-write); the rest is intact.
      }
    }
    return out;
  }

  private async appendJsonl(file: string, value: unknown): Promise<void> {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.appendFile(file, `${JSON.stringify(value)}\n`, "utf8");
  }

  private async writeJsonl(file: string, values: readonly unknown[]): Promise<void> {
    await fs.mkdir(path.dirname(file), { recursive: true });
    const body = values.map((v) => JSON.stringify(v)).join("\n");
    await fs.writeFile(file, values.length ? `${body}\n` : "", "utf8");
  }

  // ---------------------------------------------------------------------------
  // Profile / auth
  // ---------------------------------------------------------------------------

  private async ensureProfile(): Promise<LocalProfile> {
    if (this.profileCache) {
      return this.profileCache;
    }
    const existing = await this.readJson<LocalProfile | null>(this.profilePath(), null);
    if (existing && typeof existing.id === "string" && existing.id.trim()) {
      this.profileCache = existing;
      return existing;
    }
    const created: LocalProfile = { ...DEFAULT_PROFILE };
    await this.writeJson(this.profilePath(), created);
    this.profileCache = created;
    return created;
  }

  async getMe(): Promise<MeOut> {
    const p = await this.ensureProfile();
    return {
      id: p.id,
      email: p.email,
      display_name: p.display_name,
      avatar_url: p.avatar_url,
      handle: p.handle,
    };
  }

  async patchMe(body: MePatchBody): Promise<MeOut> {
    const p = await this.ensureProfile();
    const next: LocalProfile = {
      ...p,
      display_name: body.display_name?.trim() ? body.display_name.trim() : p.display_name,
      avatar_url: body.avatar_url === undefined ? p.avatar_url : body.avatar_url,
    };
    await this.writeJson(this.profilePath(), next);
    this.profileCache = next;
    return this.getMe();
  }

  async cursorExchange(): Promise<AuthResponseBody> {
    throw offlineUnsupported("Sign-in");
  }

  // ---------------------------------------------------------------------------
  // Conversations
  // ---------------------------------------------------------------------------

  private metaToSummary(meta: ConvMeta): ConversationSummary {
    return {
      id: meta.id,
      title: meta.title,
      metadata_json: meta.metadata_json,
      pinned: meta.pinned,
      updated_at: meta.updated_at,
      side_chat_has_unread: false,
      side_chat_unread_count: 0,
    };
  }

  private async loadMeta(conversationId: string): Promise<ConvMeta | null> {
    return this.readJson<ConvMeta | null>(this.metaPath(conversationId), null);
  }

  private async loadLiveMeta(conversationId: string): Promise<ConvMeta> {
    const meta = await this.loadMeta(conversationId);
    if (!meta || meta.deleted_at) {
      throw new Error(`conversation not found: ${conversationId}`);
    }
    return meta;
  }

  async listConversations(): Promise<ConversationSummary[]> {
    let ids: string[];
    try {
      ids = await fs.readdir(this.conversationsDir());
    } catch {
      return [];
    }
    const metas: ConvMeta[] = [];
    for (const id of ids) {
      const meta = await this.loadMeta(id);
      if (meta && !meta.deleted_at) {
        metas.push(meta);
      }
    }
    metas.sort((a, b) => {
      if (a.pinned !== b.pinned) {
        return a.pinned ? -1 : 1;
      }
      return b.updated_at.localeCompare(a.updated_at);
    });
    return metas.map((m) => this.metaToSummary(m));
  }

  async createConversation(body: {
    title?: string | null;
    metadata_json?: Record<string, unknown> | null;
  }): Promise<ConversationSummary> {
    const profile = await this.ensureProfile();
    const now = nowIso();
    const conversationId = randomUUID();
    const rootId = randomUUID();
    const root: StoredEvent = {
      id: rootId,
      conversation_id: conversationId,
      parent_event_id: null,
      kind: "user_input",
      actor_type: "user",
      actor_user_id: profile.id,
      content_text: "",
      content_json: null,
      visible_to: null,
      created_at: now,
      updated_at: now,
      deleted_at: null,
      deletion_group_id: null,
    };
    const meta: ConvMeta = {
      id: conversationId,
      title: body.title ?? null,
      metadata_json: body.metadata_json ?? null,
      pinned: false,
      created_at: now,
      updated_at: now,
      deleted_at: null,
      active_event_id: rootId,
      needs_context_rebuild: false,
      side_chat_last_read_seq: 0,
    };
    await fs.mkdir(this.convDir(conversationId), { recursive: true });
    await this.writeJsonl(this.eventsPath(conversationId), [root]);
    await this.writeJson(this.metaPath(conversationId), meta);
    return this.metaToSummary(meta);
  }

  async patchConversation(
    conversationId: string,
    body: {
      title?: string | null;
      metadata_json?: Record<string, unknown> | null;
      pinned?: boolean;
    },
  ): Promise<ConversationSummary> {
    const meta = await this.loadLiveMeta(conversationId);
    if (body.title !== undefined) {
      meta.title = body.title;
    }
    if (body.metadata_json !== undefined) {
      meta.metadata_json = body.metadata_json;
    }
    if (body.pinned !== undefined) {
      meta.pinned = body.pinned;
    }
    meta.updated_at = nowIso();
    await this.writeJson(this.metaPath(conversationId), meta);
    return this.metaToSummary(meta);
  }

  async deleteConversation(conversationId: string): Promise<EventSubtreeSoftDeleteOut> {
    const meta = await this.loadLiveMeta(conversationId);
    const events = await this.readJsonl<StoredEvent>(this.eventsPath(conversationId));
    meta.deleted_at = nowIso();
    meta.updated_at = meta.deleted_at;
    await this.writeJson(this.metaPath(conversationId), meta);
    return {
      deleted_count: events.filter((e) => !e.deleted_at).length,
      deletion_group_id: null,
    };
  }

  async restoreDeletedConversation(conversationId: string): Promise<RestoreSubtreeOut> {
    const meta = await this.loadMeta(conversationId);
    if (!meta) {
      throw new Error(`conversation not found: ${conversationId}`);
    }
    meta.deleted_at = null;
    meta.updated_at = nowIso();
    await this.writeJson(this.metaPath(conversationId), meta);
    return { restored_count: 1 };
  }

  // ---------------------------------------------------------------------------
  // Graph events
  // ---------------------------------------------------------------------------

  private async loadEvents(conversationId: string): Promise<StoredEvent[]> {
    return this.readJsonl<StoredEvent>(this.eventsPath(conversationId));
  }

  private storedToNode(ev: StoredEvent, noteCount: number): GraphEventNode {
    return {
      id: ev.id,
      conversation_id: ev.conversation_id,
      parent_event_id: ev.parent_event_id,
      kind: ev.kind,
      actor_type: ev.actor_type,
      actor_user_id: ev.actor_user_id,
      content_text: ev.content_text,
      content_json: ev.content_json ?? null,
      visible_to: ev.visible_to,
      created_at: ev.created_at,
      updated_at: ev.updated_at,
      starred: Boolean(ev.starred),
      note_count: noteCount,
      checkpoint_label: ev.checkpoint_label ?? null,
    };
  }

  async getTree(conversationId: string): Promise<TreeResponseBody> {
    await this.loadLiveMeta(conversationId);
    const events = await this.loadEvents(conversationId);
    const notes = await this.readJsonl<StoredNote>(this.notesPath(conversationId));
    const noteCountByEvent = new Map<string, number>();
    for (const n of notes) {
      noteCountByEvent.set(n.event_id, (noteCountByEvent.get(n.event_id) ?? 0) + 1);
    }
    const nodes = events
      .filter((e) => !e.deleted_at)
      .map((e) => this.storedToNode(e, noteCountByEvent.get(e.id) ?? 0));
    return { events: nodes };
  }

  async appendEvent(
    conversationId: string,
    body: AppendEventBody,
    options?: { idempotencyKey?: string },
  ): Promise<AppendEventResponse> {
    const profile = await this.ensureProfile();
    const meta = await this.loadLiveMeta(conversationId);
    const events = await this.loadEvents(conversationId);

    const idempotencyKey = options?.idempotencyKey?.trim();
    if (idempotencyKey) {
      const prior = events.find((e) => e.idempotency_key === idempotencyKey);
      if (prior) {
        return { id: prior.id, replayed: true };
      }
    }

    const parent = events.find((e) => e.id === body.parent_event_id);
    if (!parent) {
      throw new Error("parent_event_not_found");
    }

    const now = nowIso();
    let ev: StoredEvent;
    if (body.kind === "assistant_output") {
      if (parent.kind !== "user_input") {
        throw new Error("assistant_output must attach to user_input");
      }
      ev = {
        id: randomUUID(),
        conversation_id: conversationId,
        parent_event_id: parent.id,
        kind: "assistant_output",
        actor_type: "assistant",
        actor_user_id: null,
        content_text: body.content,
        content_json: body.content_json ?? null,
        visible_to: parent.visible_to,
        created_at: now,
        updated_at: now,
        deleted_at: parent.deleted_at ?? null,
        deletion_group_id: parent.deleted_at ? parent.deletion_group_id : null,
        ...(idempotencyKey ? { idempotency_key: idempotencyKey } : {}),
      };
    } else {
      const textNorm = (body.content || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
      const cj = body.content_json ?? null;
      if (!textNorm && !cj) {
        throw new Error("user_input requires non-empty text and/or images");
      }
      const cp =
        body.checkpoint_label != null
          ? String(body.checkpoint_label).replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim()
          : null;
      ev = {
        id: randomUUID(),
        conversation_id: conversationId,
        parent_event_id: parent.id,
        kind: "user_input",
        actor_type: "user",
        actor_user_id: profile.id,
        content_text: textNorm,
        content_json: cj,
        visible_to: body.private_branch ? profile.id : null,
        ...(cp ? { checkpoint_label: cp } : {}),
        created_at: now,
        updated_at: now,
        deleted_at: parent.deleted_at ?? null,
        deletion_group_id: parent.deleted_at ? parent.deletion_group_id : null,
        ...(idempotencyKey ? { idempotency_key: idempotencyKey } : {}),
      };
    }

    await this.appendJsonl(this.eventsPath(conversationId), ev);
    if (!ev.deleted_at) {
      meta.active_event_id = ev.id;
      meta.needs_context_rebuild = false;
    }
    meta.updated_at = now;
    await this.writeJson(this.metaPath(conversationId), meta);
    return { id: ev.id, replayed: false };
  }

  async setConversationActive(
    conversationId: string,
    body: SetConversationActiveBody,
  ): Promise<ConversationUserStateOut> {
    const meta = await this.loadLiveMeta(conversationId);
    meta.active_event_id = body.active_event_id;
    meta.needs_context_rebuild = body.needs_context_rebuild ?? false;
    await this.writeJson(this.metaPath(conversationId), meta);
    return this.callerStateFromMeta(meta);
  }

  private async callerStateFromMeta(meta: ConvMeta): Promise<ConversationUserStateOut> {
    const profile = await this.ensureProfile();
    return {
      conversation_id: meta.id,
      user_id: profile.id,
      active_event_id: meta.active_event_id,
      needs_context_rebuild: meta.needs_context_rebuild,
      last_seen_at: nowIso(),
      side_chat_last_read_seq: meta.side_chat_last_read_seq,
    };
  }

  async getConversationCallerState(conversationId: string): Promise<ConversationUserStateOut> {
    const meta = await this.loadLiveMeta(conversationId);
    return this.callerStateFromMeta(meta);
  }

  private async mutateEvent(
    conversationId: string,
    eventId: string,
    mutate: (ev: StoredEvent) => void,
  ): Promise<void> {
    const events = await this.loadEvents(conversationId);
    const target = events.find((e) => e.id === eventId);
    if (!target) {
      throw new Error(`event not found: ${eventId}`);
    }
    mutate(target);
    target.updated_at = nowIso();
    await this.writeJsonl(this.eventsPath(conversationId), events);
  }

  async putStar(conversationId: string, eventId: string): Promise<void> {
    await this.mutateEvent(conversationId, eventId, (e) => {
      e.starred = true;
    });
  }

  async deleteStar(conversationId: string, eventId: string): Promise<void> {
    await this.mutateEvent(conversationId, eventId, (e) => {
      e.starred = false;
    });
  }

  async patchEventCheckpointLabel(
    conversationId: string,
    eventId: string,
    checkpoint_label: string | null,
  ): Promise<void> {
    const label = checkpoint_label?.trim() ? checkpoint_label.trim() : null;
    await this.mutateEvent(conversationId, eventId, (e) => {
      e.checkpoint_label = label;
    });
  }

  private collectSubtreeIds(events: readonly StoredEvent[], rootId: string): Set<string> {
    const childrenByParent = new Map<string, StoredEvent[]>();
    for (const e of events) {
      if (e.deleted_at || !e.parent_event_id) {
        continue;
      }
      const arr = childrenByParent.get(e.parent_event_id);
      if (arr) {
        arr.push(e);
      } else {
        childrenByParent.set(e.parent_event_id, [e]);
      }
    }
    const ids = new Set<string>();
    const stack = [rootId];
    while (stack.length) {
      const cur = stack.pop() as string;
      if (ids.has(cur)) {
        continue;
      }
      ids.add(cur);
      for (const child of childrenByParent.get(cur) ?? []) {
        stack.push(child.id);
      }
    }
    return ids;
  }

  async deleteEventSubtree(
    conversationId: string,
    eventId: string,
  ): Promise<EventSubtreeSoftDeleteOut> {
    const meta = await this.loadLiveMeta(conversationId);
    const events = await this.loadEvents(conversationId);
    const target = events.find((e) => e.id === eventId);
    if (!target) {
      throw new Error(`event not found: ${eventId}`);
    }
    if (target.deleted_at) {
      return { deleted_count: 0, deletion_group_id: target.deletion_group_id };
    }
    if (target.parent_event_id === null) {
      throw new Error("cannot delete the conversation root");
    }
    const rootId = events.find((e) => e.parent_event_id === null)?.id ?? meta.active_event_id;
    const subtree = this.collectSubtreeIds(events, eventId);
    const deletionGroupId = randomUUID();
    const now = nowIso();
    let count = 0;
    for (const e of events) {
      if (subtree.has(e.id) && !e.deleted_at) {
        e.deleted_at = now;
        e.deletion_group_id = deletionGroupId;
        e.updated_at = now;
        count += 1;
      }
    }
    await this.writeJsonl(this.eventsPath(conversationId), events);
    if (subtree.has(meta.active_event_id)) {
      meta.active_event_id = rootId;
      meta.needs_context_rebuild = false;
      meta.updated_at = now;
      await this.writeJson(this.metaPath(conversationId), meta);
    }
    return { deleted_count: count, deletion_group_id: deletionGroupId };
  }

  async undoEventDeletion(
    conversationId: string,
    deletionGroupId: string,
  ): Promise<RestoreSubtreeOut> {
    const events = await this.loadEvents(conversationId);
    const now = nowIso();
    let restored = 0;
    for (const e of events) {
      if (e.deleted_at && e.deletion_group_id === deletionGroupId) {
        e.deleted_at = null;
        e.deletion_group_id = null;
        e.updated_at = now;
        restored += 1;
      }
    }
    await this.writeJsonl(this.eventsPath(conversationId), events);
    return { restored_count: restored };
  }

  async restoreEventSubtree(
    conversationId: string,
    eventId: string,
  ): Promise<RestoreSubtreeOut> {
    const events = await this.loadEvents(conversationId);
    const anchor = events.find((e) => e.id === eventId);
    if (!anchor) {
      throw new Error(`event not found: ${eventId}`);
    }
    const group = anchor.deletion_group_id;
    const now = nowIso();
    let restored = 0;
    for (const e of events) {
      const inGroup = group ? e.deletion_group_id === group : e.id === eventId;
      if (e.deleted_at && inGroup) {
        e.deleted_at = null;
        e.deletion_group_id = null;
        e.updated_at = now;
        restored += 1;
      }
    }
    await this.writeJsonl(this.eventsPath(conversationId), events);
    return { restored_count: restored };
  }

  // ---------------------------------------------------------------------------
  // Notes
  // ---------------------------------------------------------------------------

  async listNotes(conversationId: string): Promise<NoteOut[]> {
    return this.readJsonl<StoredNote>(this.notesPath(conversationId));
  }

  async createNote(
    conversationId: string,
    body: { event_id: string; content: string },
  ): Promise<NoteOut> {
    const profile = await this.ensureProfile();
    const now = nowIso();
    const note: StoredNote = {
      id: randomUUID(),
      event_id: body.event_id,
      author_user_id: profile.id,
      content: body.content,
      created_at: now,
      updated_at: now,
    };
    await this.appendJsonl(this.notesPath(conversationId), note);
    return note;
  }

  async patchNote(
    conversationId: string,
    noteId: string,
    body: { content: string },
  ): Promise<NoteOut> {
    const notes = await this.readJsonl<StoredNote>(this.notesPath(conversationId));
    const note = notes.find((n) => n.id === noteId);
    if (!note) {
      throw new Error(`note not found: ${noteId}`);
    }
    note.content = body.content;
    note.updated_at = nowIso();
    await this.writeJsonl(this.notesPath(conversationId), notes);
    return note;
  }

  async deleteNote(conversationId: string, noteId: string): Promise<void> {
    const notes = await this.readJsonl<StoredNote>(this.notesPath(conversationId));
    const next = notes.filter((n) => n.id !== noteId);
    await this.writeJsonl(this.notesPath(conversationId), next);
  }

  // ---------------------------------------------------------------------------
  // Lists
  // ---------------------------------------------------------------------------

  private async loadLists(conversationId: string): Promise<ConversationListsBundleOut> {
    return this.readJson<ConversationListsBundleOut>(this.listsPath(conversationId), {
      lists: [],
      items: [],
    });
  }

  private async saveLists(
    conversationId: string,
    bundle: ConversationListsBundleOut,
  ): Promise<void> {
    await this.writeJson(this.listsPath(conversationId), bundle);
  }

  async listConversationLists(
    conversationId: string,
    options?: { includeItems?: boolean },
  ): Promise<ConversationListsBundleOut> {
    const bundle = await this.loadLists(conversationId);
    if (options?.includeItems === false) {
      return { lists: bundle.lists, items: [] };
    }
    return bundle;
  }

  async createConversationList(
    conversationId: string,
    body: ConversationListCreateBody,
  ): Promise<ConversationListOut> {
    const profile = await this.ensureProfile();
    const bundle = await this.loadLists(conversationId);
    const now = nowIso();
    const list: ConversationListOut = {
      id: randomUUID(),
      conversation_id: conversationId,
      owner_user_id: profile.id,
      name: body.name,
      description: body.description ?? null,
      color: body.color ?? "#888888",
      sort_order: body.sort_order ?? bundle.lists.length,
      metadata_json: body.metadata_json ?? {},
      item_count: 0,
      created_at: now,
      updated_at: now,
    };
    bundle.lists.push(list);
    await this.saveLists(conversationId, bundle);
    return list;
  }

  async patchConversationList(
    conversationId: string,
    listId: string,
    body: ConversationListPatchBody,
  ): Promise<ConversationListOut> {
    const bundle = await this.loadLists(conversationId);
    const list = bundle.lists.find((l) => l.id === listId);
    if (!list) {
      throw new Error(`list not found: ${listId}`);
    }
    if (body.name !== undefined) {
      list.name = body.name;
    }
    if (body.description !== undefined) {
      list.description = body.description ?? null;
    }
    if (body.color !== undefined && body.color !== null) {
      list.color = body.color;
    }
    if (body.sort_order !== undefined && body.sort_order !== null) {
      list.sort_order = body.sort_order;
    }
    if (body.metadata_json !== undefined && body.metadata_json !== null) {
      list.metadata_json = body.metadata_json;
    }
    list.updated_at = nowIso();
    await this.saveLists(conversationId, bundle);
    return list;
  }

  async deleteConversationList(conversationId: string, listId: string): Promise<void> {
    const bundle = await this.loadLists(conversationId);
    bundle.lists = bundle.lists.filter((l) => l.id !== listId);
    bundle.items = bundle.items.filter((it) => it.list_id !== listId);
    await this.saveLists(conversationId, bundle);
  }

  async createConversationListItem(
    conversationId: string,
    listId: string,
    body: ConversationListItemCreateBody,
  ): Promise<ConversationListItemOut> {
    const profile = await this.ensureProfile();
    const bundle = await this.loadLists(conversationId);
    const list = bundle.lists.find((l) => l.id === listId);
    if (!list) {
      throw new Error(`list not found: ${listId}`);
    }
    const item: ConversationListItemOut = {
      id: randomUUID(),
      list_id: listId,
      conversation_id: conversationId,
      owner_user_id: profile.id,
      event_id: body.event_id,
      selected_text: body.selected_text,
      anchor_json: body.anchor_json,
      source_content_hash: body.source_content_hash ?? null,
      sort_order: body.sort_order ?? null,
      metadata_json: body.metadata_json ?? {},
      created_at: nowIso(),
    };
    bundle.items.push(item);
    list.item_count = bundle.items.filter((it) => it.list_id === listId).length;
    await this.saveLists(conversationId, bundle);
    return item;
  }

  async patchConversationListItem(
    conversationId: string,
    listId: string,
    itemId: string,
    body: ConversationListItemPatchBody,
  ): Promise<ConversationListItemOut> {
    const bundle = await this.loadLists(conversationId);
    const item = bundle.items.find((it) => it.id === itemId && it.list_id === listId);
    if (!item) {
      throw new Error(`list item not found: ${itemId}`);
    }
    if (body.list_id !== undefined && body.list_id !== null) {
      item.list_id = body.list_id;
    }
    if (body.sort_order !== undefined) {
      item.sort_order = body.sort_order ?? null;
    }
    if (body.metadata_json !== undefined && body.metadata_json !== null) {
      item.metadata_json = body.metadata_json;
    }
    for (const l of bundle.lists) {
      l.item_count = bundle.items.filter((it) => it.list_id === l.id).length;
    }
    await this.saveLists(conversationId, bundle);
    return item;
  }

  async deleteConversationListItem(
    conversationId: string,
    listId: string,
    itemId: string,
  ): Promise<void> {
    const bundle = await this.loadLists(conversationId);
    bundle.items = bundle.items.filter((it) => !(it.id === itemId && it.list_id === listId));
    for (const l of bundle.lists) {
      l.item_count = bundle.items.filter((it) => it.list_id === l.id).length;
    }
    await this.saveLists(conversationId, bundle);
  }

  // ---------------------------------------------------------------------------
  // Images
  // ---------------------------------------------------------------------------

  async uploadConversationImage(
    conversationId: string,
    bytes: Uint8Array,
    mimeType: string,
  ): Promise<{ id: string; mime_type: string; byte_size: number }> {
    const id = randomUUID();
    const filename = `${id}.${extForMime(mimeType)}`;
    await fs.mkdir(this.imagesDir(conversationId), { recursive: true });
    await fs.writeFile(path.join(this.imagesDir(conversationId), filename), bytes);
    const index = await this.readJson<StoredImageIndexEntry[]>(
      this.imagesIndexPath(conversationId),
      [],
    );
    const entry: StoredImageIndexEntry = {
      id,
      filename,
      mime_type: mimeType,
      byte_size: bytes.byteLength,
    };
    index.push(entry);
    await this.writeJson(this.imagesIndexPath(conversationId), index);
    return { id, mime_type: mimeType, byte_size: bytes.byteLength };
  }

  async getConversationImageRaw(
    conversationId: string,
    imageId: string,
  ): Promise<{ mimeType: string; arrayBuffer: ArrayBuffer }> {
    const index = await this.readJson<StoredImageIndexEntry[]>(
      this.imagesIndexPath(conversationId),
      [],
    );
    const entry = index.find((e) => e.id === imageId);
    if (!entry) {
      throw new Error(`image not found: ${imageId}`);
    }
    const buf = await fs.readFile(path.join(this.imagesDir(conversationId), entry.filename));
    const arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    return { mimeType: entry.mime_type, arrayBuffer };
  }

  // ---------------------------------------------------------------------------
  // Members (single-user)
  // ---------------------------------------------------------------------------

  async listConversationMembers(): Promise<ConversationMember[]> {
    const profile = await this.ensureProfile();
    return [
      {
        user_id: profile.id,
        role: "owner",
        email: profile.email,
        display_name: profile.display_name,
        handle: profile.handle,
      },
    ];
  }

  async searchConversationMemberInviteCandidates(): Promise<MemberInviteSearchCandidate[]> {
    return [];
  }

  async postConversationMember(): Promise<ConversationMember> {
    throw offlineUnsupported("Adding members");
  }

  async patchConversationMemberRole(): Promise<ConversationMember> {
    throw offlineUnsupported("Changing member roles");
  }

  async deleteConversationMember(): Promise<void> {
    throw offlineUnsupported("Removing members");
  }

  // ---------------------------------------------------------------------------
  // Side chat (single-user no-ops)
  // ---------------------------------------------------------------------------

  async listSideChatMessages(): Promise<SideChatMessageOut[]> {
    return [];
  }

  async postSideChatMessage(): Promise<SideChatMessageOut> {
    throw offlineUnsupported("Side chat");
  }

  async patchSideChatMessage(): Promise<SideChatMessageOut> {
    throw offlineUnsupported("Side chat");
  }

  async deleteSideChatMessage(): Promise<SideChatMessageOut> {
    throw offlineUnsupported("Side chat");
  }

  async patchSideChatRead(conversationId: string, lastReadSeq: number): Promise<void> {
    const meta = await this.loadMeta(conversationId);
    if (!meta) {
      return;
    }
    meta.side_chat_last_read_seq = lastReadSeq;
    await this.writeJson(this.metaPath(conversationId), meta);
  }

  /**
   * Offline mode has no realtime channel; park until the caller aborts so the side-chat
   * reconnect loop stays idle instead of hot-looping. Never emits a payload.
   */
  // eslint-disable-next-line require-yield
  async *streamSideChatSseEvents(
    _conversationId: string,
    options?: { signal?: AbortSignal },
  ): AsyncGenerator<unknown, void, unknown> {
    const signal = options?.signal;
    if (!signal || signal.aborted) {
      return;
    }
    await new Promise<void>((resolve) => {
      signal.addEventListener("abort", () => resolve(), { once: true });
    });
  }
}
