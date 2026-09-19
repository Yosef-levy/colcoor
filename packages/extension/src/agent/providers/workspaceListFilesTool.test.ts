import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { executeWorkspaceListFiles } from "./workspaceListFilesTool";

const roots: string[] = [];

async function workspace(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "colcoor-list-"));
  roots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe("executeWorkspaceListFiles", () => {
  it("lists directories first and applies deny and ignore rules", async () => {
    const root = await workspace();
    await fs.mkdir(path.join(root, "src"));
    await fs.mkdir(path.join(root, "node_modules"));
    await fs.writeFile(path.join(root, "src", "a.ts"), "a");
    await fs.writeFile(path.join(root, "ignored.log"), "x");
    await fs.writeFile(path.join(root, ".gitignore"), "*.log\n");
    const result = await executeWorkspaceListFiles(root, ".");
    expect(result.isError).toBe(false);
    expect(result.content).toContain("src/");
    expect(result.content).toContain("a.ts");
    expect(result.content).not.toContain("node_modules");
    expect(result.content).not.toContain("ignored.log");
  });

  it("caps entries with an explicit truncation marker", async () => {
    const root = await workspace();
    await Promise.all(
      Array.from({ length: 5 }, (_, index) =>
        fs.writeFile(path.join(root, `${index}.txt`), "x"),
      ),
    );
    const result = await executeWorkspaceListFiles(root, ".", { maxEntries: 2 });
    expect(result.content).toContain("[truncated after 2 entries]");
  });

  it("rejects paths and symlinks outside the workspace", async () => {
    const root = await workspace();
    const outside = await workspace();
    await fs.symlink(outside, path.join(root, "escape"));
    expect((await executeWorkspaceListFiles(root, "../")).isError).toBe(true);
    expect((await executeWorkspaceListFiles(root, "escape")).isError).toBe(true);
  });

  it("returns an error result for a missing directory", async () => {
    const root = await workspace();
    const result = await executeWorkspaceListFiles(root, "missing");
    expect(result.isError).toBe(true);
    expect(result.content).toContain("file not found");
  });
});
