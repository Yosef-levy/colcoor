import * as fs from "node:fs/promises";
import * as path from "node:path";

export type PersistedArtifact = {
  relPath: string;
  absolutePath: string;
  bytes: number;
};

/**
 * Extract controller-persisted artifacts from agent final text.
 * Preferred fence forms:
 *   ```path:out/explanations.md
 *   ...content...
 *   ```
 *   ```file:out/explanations.md
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

/** Filenames mentioned in the user request (e.g. explanations.md). */
export function guessOutputFilenamesFromRequest(requestText: string): string[] {
  const names = new Set<string>();
  const re = /\b([A-Za-z0-9._/-]+\.(?:md|txt|json|csv|html))\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(requestText)) !== null) {
    const name = m[1].replace(/^\.\//, "");
    if (!name.includes("request.md") && !name.includes("SCHEMA.md")) {
      names.add(path.basename(name));
    }
  }
  return [...names];
}

function isSafeJobRelPath(relPath: string): boolean {
  const norm = path.normalize(relPath).replace(/\\/g, "/");
  if (norm.startsWith("..") || norm.includes("/../") || path.isAbsolute(norm)) return false;
  return true;
}

/**
 * Resolve artifact paths into the job directory.
 * `out/foo.md` and `foo.md` land under `jobPath/out/`.
 * Other relative paths are under `jobPath/` only if they stay inside the job dir.
 */
export function resolveArtifactPath(jobPath: string, relPath: string): string | null {
  let cleaned = relPath.trim().replace(/\\/g, "/");
  if (cleaned.startsWith("./")) cleaned = cleaned.slice(2);
  // Strip absolute job path prefix if the model echoed it.
  const jobPosix = jobPath.replace(/\\/g, "/");
  if (cleaned.startsWith(jobPosix + "/")) {
    cleaned = cleaned.slice(jobPosix.length + 1);
  }
  if (cleaned.startsWith(".colcoor/jobs/")) {
    const idx = cleaned.indexOf("/out/");
    if (idx >= 0) cleaned = cleaned.slice(idx + 1); // out/...
    else return null;
  }
  if (!cleaned.startsWith("out/") && !cleaned.includes("/")) {
    cleaned = `out/${cleaned}`;
  }
  if (!isSafeJobRelPath(cleaned)) return null;
  const abs = path.resolve(jobPath, cleaned);
  if (!abs.startsWith(path.resolve(jobPath) + path.sep) && abs !== path.resolve(jobPath)) {
    return null;
  }
  return abs;
}

export async function persistExtractedArtifacts(
  jobPath: string,
  artifacts: Array<{ relPath: string; content: string }>,
): Promise<PersistedArtifact[]> {
  const written: PersistedArtifact[] = [];
  for (const art of artifacts) {
    const abs = resolveArtifactPath(jobPath, art.relPath);
    if (!abs) continue;
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, art.content, "utf8");
    written.push({
      relPath: path.relative(jobPath, abs).replace(/\\/g, "/"),
      absolutePath: abs,
      bytes: Buffer.byteLength(art.content, "utf8"),
    });
  }
  return written;
}

/**
 * If the agent did not use path fences but the request named an .md file and the
 * final reply looks like a document, write it to out/<name>.
 */
export function fallbackMarkdownArtifact(
  requestText: string,
  finalText: string,
): { relPath: string; content: string } | null {
  const names = guessOutputFilenamesFromRequest(requestText).filter((n) => n.endsWith(".md"));
  if (names.length === 0) return null;
  const body = finalText.trim();
  if (body.length < 200) return null;
  // Prefer content that looks like markdown documentation, not a short apology.
  if (/permission issue|I apologize for the technical difficulty/i.test(body) && body.length < 1500) {
    // Still allow if there is a substantial "## " structure after the apology.
    if (!/^#{1,3}\s/m.test(body)) return null;
  }
  const name = names[0];
  const content = body.endsWith("\n") ? body : body + "\n";
  return { relPath: `out/${name}`, content };
}

export async function persistOperatorReplyArtifacts(
  jobPath: string,
  requestText: string,
  finalText: string,
): Promise<PersistedArtifact[]> {
  const fenced = extractPathFencedArtifacts(finalText);
  let written = await persistExtractedArtifacts(jobPath, fenced);
  if (written.length === 0) {
    const fallback = fallbackMarkdownArtifact(requestText, finalText);
    if (fallback) {
      written = await persistExtractedArtifacts(jobPath, [fallback]);
    }
  }
  if (written.length > 0) {
    await fs.writeFile(
      path.join(jobPath, "out", "persisted_artifacts.json"),
      JSON.stringify({ written }, null, 2) + "\n",
      "utf8",
    );
  }
  return written;
}
