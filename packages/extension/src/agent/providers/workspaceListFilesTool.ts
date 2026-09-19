import * as fs from "node:fs/promises";
import * as path from "node:path";

import { resolveWorkspaceReadPath, type ReadFileToolResult } from "./workspaceReadFileTool";

const DEFAULT_DEPTH = 2;
const MAX_DEPTH = 4;
const DEFAULT_ENTRIES = 300;
const MAX_ENTRIES = 1000;
const DENIED_NAMES = new Set([
  ".git",
  ".hg",
  ".svn",
  ".venv",
  "venv",
  "node_modules",
  "dist",
  "build",
  "coverage",
  "__pycache__",
  ".pytest_cache",
  ".ruff_cache",
]);

function clampInt(value: number | undefined, fallback: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(value as number)));
}

function globRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/\*\*/g, "__COLCOOR_DOUBLE_STAR__")
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, "[^/]*")
    .replace(/\?/g, "[^/]")
    .replace(/__COLCOOR_DOUBLE_STAR__/g, ".*");
  return new RegExp(`^(?:${escaped})(?:/.*)?$`);
}

async function rootIgnoreMatchers(root: string): Promise<RegExp[]> {
  try {
    const raw = await fs.readFile(path.join(root, ".gitignore"), "utf8");
    return raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && !line.startsWith("!"))
      .map((line) => line.replace(/^\/+/, "").replace(/\/+$/, ""))
      .filter(Boolean)
      .map(globRegex);
  } catch {
    return [];
  }
}

/**
 * Return a bounded, workspace-contained tree. Symlinks are displayed but never traversed.
 * Errors follow the same non-throwing contract as `executeWorkspaceReadFile`.
 */
export async function executeWorkspaceListFiles(
  workspaceRoot: string,
  requestedPath = ".",
  opts?: { depth?: number; maxEntries?: number },
): Promise<ReadFileToolResult> {
  const resolved = await resolveWorkspaceReadPath(workspaceRoot, requestedPath || ".");
  if (!resolved.ok) return { content: resolved.error, isError: true };

  let stat: Awaited<ReturnType<typeof fs.stat>>;
  try {
    stat = await fs.stat(resolved.absolutePath);
  } catch {
    return { content: `directory not found: ${requestedPath}`, isError: true };
  }
  if (!stat.isDirectory()) {
    return { content: `not a directory: ${requestedPath}`, isError: true };
  }

  const rootResolved = await resolveWorkspaceReadPath(workspaceRoot, ".");
  if (!rootResolved.ok) return { content: rootResolved.error, isError: true };
  const root = rootResolved.absolutePath;
  const depth = clampInt(opts?.depth, DEFAULT_DEPTH, 0, MAX_DEPTH);
  const maxEntries = clampInt(opts?.maxEntries, DEFAULT_ENTRIES, 1, MAX_ENTRIES);
  const ignores = await rootIgnoreMatchers(root);
  const lines: string[] = [];
  let count = 0;
  let truncated = false;

  const walk = async (dir: string, level: number): Promise<void> => {
    if (truncated || level > depth) return;
    let entries: import("node:fs").Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      lines.push(`${"  ".repeat(level)}[unreadable: ${message}]`);
      return;
    }
    entries.sort((a, b) => {
      const directoryOrder = Number(b.isDirectory()) - Number(a.isDirectory());
      return directoryOrder || a.name.localeCompare(b.name);
    });
    for (const entry of entries) {
      if (count >= maxEntries) {
        truncated = true;
        break;
      }
      const absolute = path.join(dir, entry.name);
      const relative = path.relative(root, absolute).split(path.sep).join("/");
      if (DENIED_NAMES.has(entry.name) || ignores.some((matcher) => matcher.test(relative))) continue;
      const isDirectory = entry.isDirectory() && !entry.isSymbolicLink();
      lines.push(`${"  ".repeat(level)}${entry.name}${isDirectory ? "/" : entry.isSymbolicLink() ? "@" : ""}`);
      count += 1;
      if (isDirectory && level < depth) await walk(absolute, level + 1);
      if (truncated) break;
    }
  };

  const label = path.relative(root, resolved.absolutePath).split(path.sep).join("/") || ".";
  lines.push(`${label}/`);
  await walk(resolved.absolutePath, 1);
  if (truncated) lines.push(`[truncated after ${maxEntries} entries]`);
  return { content: lines.join("\n"), isError: false };
}
