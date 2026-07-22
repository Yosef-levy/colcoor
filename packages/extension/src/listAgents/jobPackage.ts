import * as fs from "node:fs/promises";
import * as path from "node:path";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type { ColcoorClient } from "../api/client";
import { sha256Hex } from "./buildListItemAnchor";
import {
  eventsToJsonl,
  exportAncestorClosedLite,
  exportConversationLite,
  findMissingParents,
  notesToJsonl,
  toLiteLists,
} from "./liteExport";
import { LIST_AGENT_SCHEMA_MD, LIST_AGENT_SCHEMA_VERSION } from "./schemaV1";
import { countJsonlLines, createScanState } from "./scanCoverage";
import type {
  ListAgentCapabilityProfile,
  ListAgentJobKind,
  ListAgentJobManifest,
  ListAgentJobState,
  ListAgentJobStatus,
  WorkspaceFingerprint,
} from "./types";

const execFileAsync = promisify(execFile);

export function jobsRoot(workspaceRoot: string): string {
  return path.join(workspaceRoot, ".colcoor", "jobs");
}

export function jobDir(workspaceRoot: string, jobId: string): string {
  return path.join(jobsRoot(workspaceRoot), jobId);
}

async function writeText(filePath: string, body: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, body, "utf8");
}

function fileMeta(body: string): { sha256: string; byte_size: number; line_count: number } {
  const buf = Buffer.from(body, "utf8");
  return {
    sha256: sha256Hex(buf),
    byte_size: buf.byteLength,
    line_count: countJsonlLines(body) || (body.length ? body.split("\n").length : 0),
  };
}

export async function captureWorkspaceFingerprint(
  workspaceRoot: string,
): Promise<WorkspaceFingerprint> {
  let is_git_repository = false;
  let head_before: string | null = null;
  let dirty_before = false;
  try {
    await execFileAsync("git", ["rev-parse", "--is-inside-work-tree"], {
      cwd: workspaceRoot,
    });
    is_git_repository = true;
    try {
      const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], {
        cwd: workspaceRoot,
      });
      head_before = stdout.trim() || null;
    } catch {
      head_before = null;
    }
    try {
      const { stdout } = await execFileAsync("git", ["status", "--porcelain"], {
        cwd: workspaceRoot,
      });
      dirty_before = stdout.trim().length > 0;
    } catch {
      dirty_before = false;
    }
  } catch {
    is_git_repository = false;
  }
  return { root: workspaceRoot, is_git_repository, head_before, dirty_before };
}

export async function captureWorkspaceDiff(
  workspaceRoot: string,
  before: WorkspaceFingerprint,
): Promise<{
  head_after: string | null;
  changed_files: string[];
  created_files: string[];
  deleted_files: string[];
}> {
  let head_after: string | null = null;
  const changed_files: string[] = [];
  const created_files: string[] = [];
  const deleted_files: string[] = [];
  if (!before.is_git_repository) {
    return { head_after: null, changed_files, created_files, deleted_files };
  }
  try {
    const { stdout: head } = await execFileAsync("git", ["rev-parse", "HEAD"], {
      cwd: workspaceRoot,
    });
    head_after = head.trim() || null;
  } catch {
    head_after = null;
  }
  try {
    const { stdout } = await execFileAsync("git", ["status", "--porcelain"], {
      cwd: workspaceRoot,
    });
    for (const line of stdout.split("\n")) {
      if (!line.trim()) continue;
      const code = line.slice(0, 2);
      const file = line.slice(3).trim();
      if (!file) continue;
      if (code.includes("D")) deleted_files.push(file);
      else if (code.includes("?") || code.includes("A")) created_files.push(file);
      else changed_files.push(file);
    }
  } catch {
    /* ignore */
  }
  return { head_after, changed_files, created_files, deleted_files };
}

export function initialJobState(nowIso: string): ListAgentJobState {
  return {
    status: "created",
    phase: "created",
    repair_round: 0,
    active_runner_id: null,
    scan_coverage_summary: { complete: false, covered_lines: 0, total_lines: 0 },
    cancellation_requested: false,
    error: null,
    created_at: nowIso,
    started_at: null,
    updated_at: nowIso,
    completed_at: null,
    resume: { last_chunk_end: null },
    proposals_path: null,
  };
}

export async function readJsonFile<T>(filePath: string): Promise<T> {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw) as T;
}

export async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await writeText(filePath, JSON.stringify(value, null, 2) + "\n");
}

export async function appendRunLog(
  jobPath: string,
  event: Record<string, unknown>,
): Promise<void> {
  const line = JSON.stringify({ ts: new Date().toISOString(), ...event }) + "\n";
  await fs.appendFile(path.join(jobPath, "run_log.jsonl"), line, "utf8");
}

export async function updateJobState(
  jobPath: string,
  patch: Partial<ListAgentJobState> & { status?: ListAgentJobStatus },
): Promise<ListAgentJobState> {
  const statePath = path.join(jobPath, "state.json");
  const current = await readJsonFile<ListAgentJobState>(statePath);
  const next: ListAgentJobState = {
    ...current,
    ...patch,
    updated_at: new Date().toISOString(),
  };
  await writeJsonFile(statePath, next);
  return next;
}

export type FreezeListBuilderOptions = {
  workspaceRoot: string;
  api: ColcoorClient;
  conversationId: string;
  requestText: string;
  targetListName: string;
  currentUserId: string | null;
  autoCommit?: boolean;
};

export type FreezeListOperatorOptions = {
  workspaceRoot: string;
  api: ColcoorClient;
  conversationId: string;
  requestText: string;
  listIds: string[];
  currentUserId: string | null;
};

export type FrozenJob = {
  jobId: string;
  jobPath: string;
  manifest: ListAgentJobManifest;
};

async function writeCommonPackageFiles(
  jobPath: string,
  requestText: string,
  eventsJsonl: string,
  notesJsonl: string,
  listsJson: string,
): Promise<{
  schema_sha256: string;
  files: ListAgentJobManifest["files"];
}> {
  await fs.mkdir(path.join(jobPath, "out"), { recursive: true });
  const schemaBody = LIST_AGENT_SCHEMA_MD;
  // Normalize trailing newlines before hashing so manifest digests match on-disk bytes.
  const requestBody = requestText.endsWith("\n") ? requestText : `${requestText}\n`;
  const listsBody = listsJson.endsWith("\n") ? listsJson : `${listsJson}\n`;
  await writeText(path.join(jobPath, "SCHEMA.md"), schemaBody);
  await writeText(path.join(jobPath, "request.md"), requestBody);
  await writeText(path.join(jobPath, "events.jsonl"), eventsJsonl);
  await writeText(path.join(jobPath, "notes.jsonl"), notesJsonl);
  await writeText(path.join(jobPath, "lists.json"), listsBody);
  await writeText(path.join(jobPath, "run_log.jsonl"), "");

  const files: ListAgentJobManifest["files"] = {
    "SCHEMA.md": fileMeta(schemaBody),
    "request.md": fileMeta(requestBody),
    "events.jsonl": fileMeta(eventsJsonl),
    "notes.jsonl": fileMeta(notesJsonl),
    "lists.json": fileMeta(listsBody),
  };
  return { schema_sha256: files["SCHEMA.md"].sha256, files };
}

export async function freezeListBuilderJob(opts: FreezeListBuilderOptions): Promise<FrozenJob> {
  const jobId = randomUUID();
  const jobPath = jobDir(opts.workspaceRoot, jobId);
  await fs.mkdir(path.join(jobPath, "out"), { recursive: true });
  const nowIso = new Date().toISOString();

  let state = initialJobState(nowIso);
  state = { ...state, status: "freezing", phase: "freezing" };
  await writeJsonFile(path.join(jobPath, "state.json"), state);

  const [{ events }, notes] = await Promise.all([
    opts.api.getTree(opts.conversationId),
    opts.api.listNotes(opts.conversationId),
  ]);
  const exported = exportConversationLite(events, notes, opts.currentUserId, { sharedOnly: true });
  const missing = findMissingParents(exported.events);
  if (missing.length > 0) {
    throw new Error(`Parent-closure invariant violated; missing parents: ${missing.join(", ")}`);
  }

  const eventsJsonl = eventsToJsonl(exported.events);
  const notesJsonl = notesToJsonl(exported.notes);
  const listsJson = JSON.stringify({ lists: [], items: [] }, null, 2);
  const { schema_sha256, files } = await writeCommonPackageFiles(
    jobPath,
    opts.requestText,
    eventsJsonl,
    notesJsonl,
    listsJson,
  );

  const totalLines = countJsonlLines(eventsJsonl);
  const scan = createScanState(totalLines);
  await writeJsonFile(path.join(jobPath, "scan_state.json"), scan);

  const capability_profile: ListAgentCapabilityProfile = "list-builder-readonly";
  const kind: ListAgentJobKind = "list-builder";
  const manifest: ListAgentJobManifest = {
    job_id: jobId,
    kind,
    capability_profile,
    conversation_id: opts.conversationId,
    list_ids: [],
    target_list_name: opts.targetListName,
    request_metadata: { title: opts.targetListName },
    schema_version: LIST_AGENT_SCHEMA_VERSION,
    schema_sha256,
    files,
    snapshot: {
      event_count: exported.events.length,
      note_count: exported.notes.length,
      list_count: 0,
      item_count: 0,
    },
    model_config: { cli_mode: "agent", capability_profile },
    created_at: nowIso,
    auto_commit: Boolean(opts.autoCommit),
  };
  await writeJsonFile(path.join(jobPath, "manifest.json"), manifest);

  state = {
    ...state,
    status: "ready",
    phase: "ready",
    scan_coverage_summary: {
      complete: scan.complete,
      covered_lines: 0,
      total_lines: totalLines,
    },
    updated_at: new Date().toISOString(),
  };
  await writeJsonFile(path.join(jobPath, "state.json"), state);
  await appendRunLog(jobPath, { type: "state", status: "ready" });

  return { jobId, jobPath, manifest };
}

export async function freezeListOperatorJob(opts: FreezeListOperatorOptions): Promise<FrozenJob> {
  const jobId = randomUUID();
  const jobPath = jobDir(opts.workspaceRoot, jobId);
  await fs.mkdir(path.join(jobPath, "out"), { recursive: true });
  const nowIso = new Date().toISOString();

  let state = initialJobState(nowIso);
  state = { ...state, status: "freezing", phase: "freezing" };
  await writeJsonFile(path.join(jobPath, "state.json"), state);

  const listIdSet = new Set(opts.listIds);
  const [{ events }, notes, listsBundle] = await Promise.all([
    opts.api.getTree(opts.conversationId),
    opts.api.listNotes(opts.conversationId),
    opts.api.listConversationLists(opts.conversationId),
  ]);
  const selectedItems = listsBundle.items.filter((it) => listIdSet.has(it.list_id));
  const exported = exportAncestorClosedLite(
    events,
    notes,
    selectedItems,
    opts.currentUserId,
    { sharedOnly: true },
  );
  const missing = findMissingParents(exported.events);
  if (missing.length > 0) {
    throw new Error(`Parent-closure invariant violated; missing parents: ${missing.join(", ")}`);
  }

  const liteLists = toLiteLists(listsBundle.lists, listsBundle.items, listIdSet);
  const eventsJsonl = eventsToJsonl(exported.events);
  const notesJsonl = notesToJsonl(exported.notes);
  const listsJson = JSON.stringify(liteLists, null, 2);
  const { schema_sha256, files } = await writeCommonPackageFiles(
    jobPath,
    opts.requestText,
    eventsJsonl,
    notesJsonl,
    listsJson,
  );

  const workspace = await captureWorkspaceFingerprint(opts.workspaceRoot);
  const capability_profile: ListAgentCapabilityProfile = "list-operator-workspace";
  const kind: ListAgentJobKind = "list-operator";
  const manifest: ListAgentJobManifest = {
    job_id: jobId,
    kind,
    capability_profile,
    conversation_id: opts.conversationId,
    list_ids: [...listIdSet],
    target_list_name: null,
    request_metadata: {},
    schema_version: LIST_AGENT_SCHEMA_VERSION,
    schema_sha256,
    files,
    snapshot: {
      event_count: exported.events.length,
      note_count: exported.notes.length,
      list_count: liteLists.lists.length,
      item_count: liteLists.items.length,
    },
    model_config: { cli_mode: "agent", capability_profile },
    created_at: nowIso,
    workspace,
    auto_commit: false,
  };
  await writeJsonFile(path.join(jobPath, "manifest.json"), manifest);

  // Operator jobs do not use scan coverage; write empty complete state for UI uniformity.
  await writeJsonFile(path.join(jobPath, "scan_state.json"), createScanState(0));

  state = {
    ...state,
    status: "ready",
    phase: "ready",
    scan_coverage_summary: { complete: true, covered_lines: 0, total_lines: 0 },
    updated_at: new Date().toISOString(),
  };
  await writeJsonFile(path.join(jobPath, "state.json"), state);
  await appendRunLog(jobPath, { type: "state", status: "ready" });

  return { jobId, jobPath, manifest };
}

export async function listJobIds(workspaceRoot: string): Promise<string[]> {
  const root = jobsRoot(workspaceRoot);
  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
}

export async function loadJobSnapshot(workspaceRoot: string, jobId: string): Promise<{
  jobPath: string;
  manifest: ListAgentJobManifest;
  state: ListAgentJobState;
  runLog: string;
}> {
  const jobPath = jobDir(workspaceRoot, jobId);
  const [manifest, state, runLog] = await Promise.all([
    readJsonFile<ListAgentJobManifest>(path.join(jobPath, "manifest.json")),
    readJsonFile<ListAgentJobState>(path.join(jobPath, "state.json")),
    fs.readFile(path.join(jobPath, "run_log.jsonl"), "utf8").catch(() => ""),
  ]);
  return { jobPath, manifest, state, runLog };
}

/** Verify frozen file hashes still match manifest (blocks resume on tamper). */
export async function verifyPackageHashes(jobPath: string, manifest: ListAgentJobManifest): Promise<string | null> {
  for (const [rel, meta] of Object.entries(manifest.files)) {
    const body = await fs.readFile(path.join(jobPath, rel));
    const hex = sha256Hex(body);
    if (hex !== meta.sha256) {
      return `Hash mismatch for ${rel}`;
    }
  }
  return null;
}
