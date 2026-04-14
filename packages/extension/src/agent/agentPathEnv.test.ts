import { homedir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { processEnvForCursorCli } from "./agentPathEnv";

describe("processEnvForCursorCli", () => {
  it("prepends ~/.local/bin to PATH", () => {
    const env = processEnvForCursorCli();
    const localBin = join(homedir(), ".local", "bin");
    expect(env.PATH).toContain(localBin);
    expect(env.PATH?.startsWith(localBin)).toBe(true);
  });

  it("keeps the original PATH after the prefixed segment", () => {
    const orig = process.env.PATH ?? "";
    const env = processEnvForCursorCli();
    const sep = process.platform === "win32" ? ";" : ":";
    if (!orig) {
      expect(env.PATH?.length).toBeGreaterThan(0);
      return;
    }
    expect(env.PATH === orig || env.PATH?.endsWith(sep + orig) || env.PATH?.endsWith(orig)).toBe(true);
  });

  it("includes non-PATH variables from the current process", () => {
    const env = processEnvForCursorCli();
    if (process.platform === "win32") {
      expect(env).toHaveProperty("SystemRoot");
    } else {
      expect(env).toHaveProperty("HOME");
      expect(env.HOME).toBe(process.env.HOME);
    }
  });

  it("adds a second Cursor-related directory on POSIX", () => {
    if (process.platform === "win32") {
      return;
    }
    const env = processEnvForCursorCli();
    expect(env.PATH).toContain(join(homedir(), ".cursor", "bin"));
  });
});
