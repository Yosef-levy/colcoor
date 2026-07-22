import * as fs from "node:fs/promises";
import * as path from "node:path";

export type PersistedArtifact = {
  relPath: string;
  absolutePath: string;
  bytes: number;
};

/**
 * Extract controller-persisted artifacts from agent final text.
 * Fence forms (workspace-relative paths):
 *   ```path:explanations.md
 *   ...content...
 *   ```
 *   ```file:docs/notes.md
 *   ...
 *   ```
 */
export function extractPathFencedArtifacts(text: string): Array<{ relPath: string; content: string }> {
  const out: Array<{ relPath: string; content: string }> = [];
  const re = /```(?:path|file)\s*:\s*([^\n`]+)\n([\s\S]*?)```/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const relPath = m[1].trim().replace(/^["']|["']$/g, "");
    const content = m[2].replace(/^\n/, "");
    if (relPath && content.trim()) {
      out.push({ relPath, content: content.endsWith("\n") ? content : content + "\n" });
    }
  }
  return out;
}

/** Paths/filenames mentioned in the user request (e.g. explanations.md, docs/a.md). */
export function guessOutputPathsFromRequest(requestText: string): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  const re = /\b((?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+\.(?:md|txt|json|csv|html))\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(requestText)) !== null) {
    const name = m[1].replace(/^\.\//, "");
    if (name.includes("request.md") || name.includes("SCHEMA.md")) continue;
    if (seen.has(name)) continue;
    seen.add(name);
    names.push(name);
  }
  return names;
}

/** @deprecated use guessOutputPathsFromRequest */
export function guessOutputFilenamesFromRequest(requestText: string): string[] {
  return guessOutputPathsFromRequest(requestText).map((p) => path.basename(p));
}

function isInsideRoot(root: string, candidate: string): boolean {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(candidate);
  return resolved === resolvedRoot || resolved.startsWith(resolvedRoot + path.sep);
}

/**
 * Resolve an artifact path under the workspace (same freedom as the main-thread agent).
 * Rejects escapes outside `workspaceRoot`.
 */
export function resolveWorkspaceArtifactPath(
  workspaceRoot: string,
  relOrAbsPath: string,
): string | null {
  let cleaned = relOrAbsPath.trim().replace(/\\/g, "/");
  if (cleaned.startsWith("file://")) {
    cleaned = cleaned.slice("file://".length);
  }
  if (cleaned.startsWith("./")) cleaned = cleaned.slice(2);

  const abs = path.isAbsolute(cleaned)
    ? path.resolve(cleaned)
    : path.resolve(workspaceRoot, cleaned);

  if (!isInsideRoot(workspaceRoot, abs)) return null;
  return abs;
}

/** @deprecated prefer resolveWorkspaceArtifactPath */
export function resolveArtifactPath(jobPath: string, relPath: string): string | null {
  // Legacy: job-scoped. Map bare names to job/out/ for old tests/callers.
  let cleaned = relPath.trim().replace(/\\/g, "/");
  if (cleaned.startsWith("./")) cleaned = cleaned.slice(2);
  if (!cleaned.startsWith("out/") && !cleaned.includes("/")) {
    cleaned = `out/${cleaned}`;
  }
  const norm = path.normalize(cleaned).replace(/\\/g, "/");
  if (norm.startsWith("..") || path.isAbsolute(norm)) return null;
  const abs = path.resolve(jobPath, cleaned);
  if (!isInsideRoot(jobPath, abs)) return null;
  return abs;
}

export async function persistExtractedArtifacts(
  workspaceRoot: string,
  artifacts: Array<{ relPath: string; content: string }>,
): Promise<PersistedArtifact[]> {
  const written: PersistedArtifact[] = [];
  for (const art of artifacts) {
    const abs = resolveWorkspaceArtifactPath(workspaceRoot, art.relPath);
    if (!abs) continue;
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, art.content, "utf8");
    written.push({
      relPath: path.relative(workspaceRoot, abs).replace(/\\/g, "/") || path.basename(abs),
      absolutePath: abs,
      bytes: Buffer.byteLength(art.content, "utf8"),
    });
  }
  return written;
}

/**
 * If the agent did not use path fences but the request named a file and the
 * final reply looks like a document, write it to that workspace-relative path.
 */
export function fallbackMarkdownArtifact(
  requestText: string,
  finalText: string,
): { relPath: string; content: string } | null {
  const paths = guessOutputPathsFromRequest(requestText).filter((n) => n.endsWith(".md"));
  if (paths.length === 0) return null;
  const body = finalText.trim();
  if (body.length < 200) return null;
  if (/permission issue|I apologize for the technical difficulty/i.test(body) && body.length < 1500) {
    if (!/^#{1,3}\s/m.test(body)) return null;
  }
  // Prefer path as written in the request (e.g. explanations.md at project root).
  let relPath = paths[0];
  const lower = requestText.toLowerCase();
  if (
    (lower.includes("project root") ||
      lower.includes("workspace root") ||
      lower.includes("repo root") ||
      lower.includes("root folder")) &&
    !relPath.includes("/")
  ) {
    relPath = paths[0]; // already basename at root
  }
  const content = body.endsWith("\n") ? body : body + "\n";
  return { relPath, content };
}

export async function persistOperatorReplyArtifacts(
  workspaceRoot: string,
  jobPath: string,
  requestText: string,
  finalText: string,
): Promise<PersistedArtifact[]> {
  const fenced = extractPathFencedArtifacts(finalText);
  let written = await persistExtractedArtifacts(workspaceRoot, fenced);
  if (written.length === 0) {
    const fallback = fallbackMarkdownArtifact(requestText, finalText);
    if (fallback) {
      written = await persistExtractedArtifacts(workspaceRoot, [fallback]);
    }
  }
  if (written.length > 0) {
    await fs.mkdir(path.join(jobPath, "out"), { recursive: true });
    await fs.writeFile(
      path.join(jobPath, "out", "persisted_artifacts.json"),
      JSON.stringify({ written }, null, 2) + "\n",
      "utf8",
    );
  }
  return written;
}
