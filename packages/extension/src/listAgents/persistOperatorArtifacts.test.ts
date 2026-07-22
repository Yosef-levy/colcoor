import { describe, expect, it } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach } from "vitest";

import {
  extractPathFencedArtifacts,
  fallbackMarkdownArtifact,
  guessOutputFilenamesFromRequest,
  persistOperatorReplyArtifacts,
  resolveArtifactPath,
} from "./persistOperatorArtifacts";

describe("persistOperatorArtifacts", () => {
  let tmp: string | undefined;
  afterEach(async () => {
    if (tmp) await fs.rm(tmp, { recursive: true, force: true });
  });

  it("extracts path-fenced artifacts", () => {
    const text = `Here you go:\n\n\`\`\`path:out/explanations.md\n# Hello\n\nWorld\n\`\`\`\n`;
    expect(extractPathFencedArtifacts(text)).toEqual([
      { relPath: "out/explanations.md", content: "# Hello\n\nWorld\n" },
    ]);
  });

  it("guesses filenames from the request", () => {
    expect(guessOutputFilenamesFromRequest("Create explanations.md for all concepts")).toEqual([
      "explanations.md",
    ]);
  });

  it("resolves safe out paths", async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "colcoor-art-"));
    expect(resolveArtifactPath(tmp, "explanations.md")?.endsWith(`${path.sep}out${path.sep}explanations.md`)).toBe(
      true,
    );
    expect(resolveArtifactPath(tmp, "../etc/passwd")).toBeNull();
  });

  it("falls back to writing request-named md from final reply", async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "colcoor-art-"));
    const body =
      "## Concept 1\n\n" +
      "x".repeat(250) +
      "\n\n## Concept 2\n\n" +
      "y".repeat(250) +
      "\n";
    const written = await persistOperatorReplyArtifacts(
      tmp,
      "Please write explanations.md covering the list",
      body,
    );
    expect(written).toHaveLength(1);
    expect(written[0].relPath).toBe("out/explanations.md");
    const disk = await fs.readFile(path.join(tmp, "out", "explanations.md"), "utf8");
    expect(disk).toContain("## Concept 1");
  });

  it("fallbackMarkdownArtifact returns null for tiny replies", () => {
    expect(fallbackMarkdownArtifact("write explanations.md", "sorry")).toBeNull();
  });
});
