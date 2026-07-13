import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  READ_FILE_MAX_CHARS,
  executeWorkspaceReadFile,
  resolveWorkspaceReadPath,
} from "./workspaceReadFileTool";

describe("workspaceReadFileTool", () => {
  let tmpRoot: string | undefined;

  afterEach(async () => {
    if (tmpRoot) {
      await fs.rm(tmpRoot, { recursive: true, force: true });
      tmpRoot = undefined;
    }
  });

  async function makeRoot(): Promise<string> {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "colcoor-read-"));
    return tmpRoot;
  }

  it("reads a relative file under the workspace", async () => {
    const root = await makeRoot();
    await fs.writeFile(path.join(root, "hello.txt"), "hello world", "utf8");
    const result = await executeWorkspaceReadFile(root, "hello.txt");
    expect(result).toEqual({ content: "hello world", isError: false });
  });

  it("rejects path escape outside the workspace", async () => {
    const root = await makeRoot();
    const resolved = await resolveWorkspaceReadPath(root, "../outside.txt");
    expect(resolved.ok).toBe(false);
    if (!resolved.ok) {
      expect(resolved.error).toMatch(/outside the workspace|file not found/);
    }
    const result = await executeWorkspaceReadFile(root, path.join(root, "..", "nope.txt"));
    expect(result.isError).toBe(true);
  });

  it("truncates oversized files", async () => {
    const root = await makeRoot();
    const body = "a".repeat(READ_FILE_MAX_CHARS + 50);
    await fs.writeFile(path.join(root, "big.txt"), body, "utf8");
    const result = await executeWorkspaceReadFile(root, "big.txt", READ_FILE_MAX_CHARS);
    expect(result.isError).toBe(false);
    expect(result.content.startsWith("a".repeat(READ_FILE_MAX_CHARS))).toBe(true);
    expect(result.content).toContain("[truncated after");
  });

  it("rejects binary files", async () => {
    const root = await makeRoot();
    await fs.writeFile(path.join(root, "bin.dat"), Buffer.from([0, 1, 2, 3, 0, 5]));
    const result = await executeWorkspaceReadFile(root, "bin.dat");
    expect(result.isError).toBe(true);
    expect(result.content).toMatch(/binary/i);
  });
});
