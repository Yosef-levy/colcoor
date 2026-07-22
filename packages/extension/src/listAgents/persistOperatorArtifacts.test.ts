import { describe, expect, it, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import {
  extractPathFencedArtifacts,
  fallbackMarkdownArtifact,
  guessOutputPathsFromRequest,
  persistOperatorReplyArtifacts,
  resolveWorkspaceArtifactPath,
} from "./persistOperatorArtifacts";

describe("persistOperatorArtifacts", () => {
  let tmp: string | undefined;
  afterEach(async () => {
    if (tmp) await fs.rm(tmp, { recursive: true, force: true });
  });

  it("extracts path-fenced artifacts", () => {
    const text = `Here you go:\n\n\`\`\`path:explanations.md\n# Hello\n\nWorld\n\`\`\`\n`;
    expect(extractPathFencedArtifacts(text)).toEqual([
      { relPath: "explanations.md", content: "# Hello\n\nWorld\n" },
    ]);
  });

  it("guesses paths from the request including root filenames", () => {
    expect(
      guessOutputPathsFromRequest("explain all concepts in a new file - explanations.md in the project root folder"),
    ).toEqual(["explanations.md"]);
  });

  it("resolves workspace paths and rejects escapes", async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "colcoor-ws-"));
    expect(resolveWorkspaceArtifactPath(tmp, "explanations.md")).toBe(
      path.join(tmp, "explanations.md"),
    );
    expect(resolveWorkspaceArtifactPath(tmp, "docs/a.md")).toBe(path.join(tmp, "docs", "a.md"));
    expect(resolveWorkspaceArtifactPath(tmp, "../etc/passwd")).toBeNull();
  });

  it("writes request-named md to workspace root from final reply", async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "colcoor-ws-"));
    const job = path.join(tmp, ".colcoor", "jobs", "j1");
    await fs.mkdir(path.join(job, "out"), { recursive: true });
    const body =
      "## Concept 1\n\n" +
      "x".repeat(250) +
      "\n\n## Concept 2\n\n" +
      "y".repeat(250) +
      "\n";
    const written = await persistOperatorReplyArtifacts(
      tmp,
      job,
      "explain concepts in explanations.md in the project root folder",
      body,
    );
    expect(written).toHaveLength(1);
    expect(written[0].relPath).toBe("explanations.md");
    const disk = await fs.readFile(path.join(tmp, "explanations.md"), "utf8");
    expect(disk).toContain("## Concept 1");
  });

  it("fallbackMarkdownArtifact returns null for tiny replies", () => {
    expect(fallbackMarkdownArtifact("write explanations.md", "sorry")).toBeNull();
  });
});
