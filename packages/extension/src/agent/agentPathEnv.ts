/**
 * VS Code extension hosts often start without an interactive shell, so they do not inherit PATH
 * from ~/.bashrc or ~/.zshrc. Prepend common agent CLI and npm-global install locations.
 */

import { homedir } from "node:os";
import { join } from "node:path";

function extraPathDirs(): string[] {
  const h = homedir();
  if (process.platform === "win32") {
    const local = process.env.LOCALAPPDATA?.trim();
    const dirs = [join(h, ".local", "bin")];
    if (local) {
      dirs.push(join(local, "Programs", "cursor"));
      dirs.push(join(local, "Programs", "Cursor"));
    }
    return dirs;
  }
  return [
    join(h, ".local", "bin"),
    join(h, ".cursor", "bin"),
    join(h, ".npm-global", "bin"),
    join(h, ".npm", "bin"),
  ];
}

/** `process.env` with PATH prefixed by typical agent CLI install directories. */
export function processEnvForAgentCli(): NodeJS.ProcessEnv {
  const sep = process.platform === "win32" ? ";" : ":";
  const prefix = extraPathDirs().join(sep);
  const base = process.env.PATH ?? "";
  const pathValue = prefix ? `${prefix}${sep}${base}` : base;
  return { ...process.env, PATH: pathValue };
}
