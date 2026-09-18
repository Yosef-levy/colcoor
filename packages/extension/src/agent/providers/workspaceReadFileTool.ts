import * as fs from "node:fs/promises";
import * as path from "node:path";

/** Soft cap on file body returned to the model (chars). */
export const READ_FILE_MAX_CHARS = 100_000;

export type ReadFileToolResult = {
  content: string;
  isError: boolean;
};

function looksBinary(buf: Buffer): boolean {
  const sample = buf.subarray(0, Math.min(buf.length, 8192));
  let nul = 0;
  for (let i = 0; i < sample.length; i++) {
    if (sample[i] === 0) {
      nul++;
    }
  }
  return nul > 0;
}

/**
 * Resolve `requestedPath` under `workspaceRoot` and reject escapes / symlink escapes.
 * Returns absolute real paths when successful.
 */
export async function resolveWorkspaceReadPath(
  workspaceRoot: string,
  requestedPath: string,
): Promise<{ ok: true; absolutePath: string } | { ok: false; error: string }> {
  const rootRaw = workspaceRoot.trim();
  const req = requestedPath.trim();
  if (!rootRaw) {
    return { ok: false, error: "workspace root is not set" };
  }
  if (!req) {
    return { ok: false, error: "path is required" };
  }

  let rootReal: string;
  try {
    rootReal = await fs.realpath(rootRaw);
  } catch {
    return { ok: false, error: `workspace root does not exist: ${rootRaw}` };
  }

  const candidate = path.isAbsolute(req) ? req : path.resolve(rootReal, req);
  let fileReal: string;
  try {
    fileReal = await fs.realpath(candidate);
  } catch {
    // Path may not exist yet, or parent missing — still reject if normalized path escapes.
    const normalized = path.normalize(candidate);
    const prefix = rootReal.endsWith(path.sep) ? rootReal : rootReal + path.sep;
    if (normalized !== rootReal && !normalized.startsWith(prefix)) {
      return { ok: false, error: "path is outside the workspace" };
    }
    return { ok: false, error: `file not found: ${req}` };
  }

  const prefix = rootReal.endsWith(path.sep) ? rootReal : rootReal + path.sep;
  if (fileReal !== rootReal && !fileReal.startsWith(prefix)) {
    return { ok: false, error: "path is outside the workspace" };
  }

  return { ok: true, absolutePath: fileReal };
}

/**
 * Workspace-scoped file read for the ask-mode Messages API `read_file` tool.
 * Never throws — errors are returned as `isError` tool results.
 */
export async function executeWorkspaceReadFile(
  workspaceRoot: string,
  requestedPath: string,
  maxChars: number = READ_FILE_MAX_CHARS,
): Promise<ReadFileToolResult> {
  const resolved = await resolveWorkspaceReadPath(workspaceRoot, requestedPath);
  if (!resolved.ok) {
    return { content: resolved.error, isError: true };
  }

  let st: Awaited<ReturnType<typeof fs.stat>>;
  try {
    st = await fs.stat(resolved.absolutePath);
  } catch {
    return { content: `file not found: ${requestedPath}`, isError: true };
  }
  if (!st.isFile()) {
    return { content: `not a regular file: ${requestedPath}`, isError: true };
  }

  let buf: Buffer;
  try {
    buf = await fs.readFile(resolved.absolutePath);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { content: `failed to read file: ${msg}`, isError: true };
  }

  if (looksBinary(buf)) {
    return {
      content: `binary file (not returned as text): ${requestedPath} (${buf.length} bytes)`,
      isError: true,
    };
  }

  let text = buf.toString("utf8");
  if (text.length > maxChars) {
    text =
      text.slice(0, maxChars) +
      `\n\n[truncated after ${maxChars} characters; file is ${text.length} characters total]`;
  }
  return { content: text, isError: false };
}
