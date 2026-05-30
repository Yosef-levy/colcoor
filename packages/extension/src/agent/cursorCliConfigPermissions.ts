import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import { shellAllowToken } from "./cursorToolCallRejection";

type CliConfigPermissions = {
  allow?: string[];
  deny?: string[];
};

type CliConfigFile = {
  permissions?: CliConfigPermissions;
};

export function cursorCliConfigPath(): string {
  return path.join(os.homedir(), ".cursor", "cli-config.json");
}

export async function readCliConfigFile(): Promise<CliConfigFile> {
  const filePath = cursorCliConfigPath();
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as CliConfigFile;
    }
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code !== "ENOENT") {
      throw new Error(`Colcoor: could not read ${filePath}: ${err.message}`);
    }
  }
  return { permissions: { allow: [], deny: [] } };
}

/** Append a permission token to ~/.cursor/cli-config.json allow list if missing. Returns whether it was added. */
export async function appendCliPermissionToken(token: string): Promise<boolean> {
  const trimmed = token.trim();
  if (!trimmed) {
    return false;
  }
  const filePath = cursorCliConfigPath();
  const config = await readCliConfigFile();
  const permissions = config.permissions ?? { allow: [], deny: [] };
  const allow = Array.isArray(permissions.allow) ? [...permissions.allow] : [];
  if (allow.includes(trimmed)) {
    return false;
  }
  allow.push(trimmed);
  const next: CliConfigFile = {
    ...config,
    permissions: {
      ...permissions,
      allow,
      deny: Array.isArray(permissions.deny) ? permissions.deny : [],
    },
  };
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return true;
}

/** Append each token to the CLI allow list; returns tokens newly added. */
export async function appendCliPermissionTokens(tokens: string[]): Promise<string[]> {
  const added: string[] = [];
  for (const token of tokens) {
    if (await appendCliPermissionToken(token)) {
      added.push(token);
    }
  }
  return added;
}

/** Append `Shell(commandBase)` to ~/.cursor/cli-config.json allow list if missing. Returns whether it was added. */
export async function appendCliShellAllow(commandBase: string): Promise<boolean> {
  const base = commandBase.trim();
  if (!base) {
    return false;
  }
  return appendCliPermissionToken(shellAllowToken(base));
}

/** Append each base to the CLI allow list; returns bases newly added. */
export async function appendCliShellAllows(commandBases: string[]): Promise<string[]> {
  const added: string[] = [];
  for (const base of commandBases) {
    if (await appendCliShellAllow(base)) {
      added.push(base);
    }
  }
  return added;
}
