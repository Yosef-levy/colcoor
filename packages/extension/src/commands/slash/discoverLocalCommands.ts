import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import type { SlashCommand } from "./types";
import { isColcoorSlashName } from "./types";

export type DiscoverLocalOptions = {
  /**
   * Override scan roots for tests. When set, only these roots are scanned with
   * Claude + Cursor relative paths under each root (no implicit home dirs).
   */
  roots?: string[];
  /** Override home directory (defaults to `os.homedir()`). */
  homeDir?: string;
};

/**
 * Discover provider-native slash commands / skills from disk.
 *
 * Default scan order (first wins on name collision):
 * 1. `<workspace>/.cursor/skills`
 * 2. `~/.cursor/skills`
 * 3. `~/.cursor/skills-cursor` (Cursor built-ins)
 * 4. `<workspace|~>/.claude/skills` and `.claude/commands`
 */
export function discoverLocalProviderCommands(
  workspaceRoot: string,
  options?: DiscoverLocalOptions,
): SlashCommand[] {
  const out: SlashCommand[] = [];
  const seen = new Set<string>();

  const pushAll = (commands: SlashCommand[]): void => {
    for (const cmd of commands) {
      const key = cmd.name.toLowerCase();
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      out.push(cmd);
    }
  };

  if (options?.roots?.length) {
    for (const root of options.roots) {
      const r = root.trim();
      if (!r) {
        continue;
      }
      pushAll(discoverSkillsInDir(join(r, ".cursor", "skills")));
      pushAll(discoverSkillsInDir(join(r, ".cursor", "skills-cursor")));
      pushAll(discoverInClaudeRoot(r));
    }
    return out;
  }

  const workspace = workspaceRoot.trim();
  const home = (options?.homeDir ?? homedir()).trim();

  if (workspace) {
    pushAll(discoverSkillsInDir(join(workspace, ".cursor", "skills")));
  }
  if (home) {
    pushAll(discoverSkillsInDir(join(home, ".cursor", "skills")));
    pushAll(discoverSkillsInDir(join(home, ".cursor", "skills-cursor")));
  }
  if (workspace) {
    pushAll(discoverInClaudeRoot(workspace));
  }
  if (home && home !== workspace) {
    pushAll(discoverInClaudeRoot(home));
  }
  return out;
}

/** Scan `<dir>/<name>/SKILL.md` trees (Cursor / Claude Agent Skills layout). */
function discoverSkillsInDir(skillsDir: string): SlashCommand[] {
  const out: SlashCommand[] = [];
  const seen = new Set<string>();
  if (!existsSync(skillsDir) || !safeIsDir(skillsDir)) {
    return out;
  }
  for (const entry of safeReaddir(skillsDir)) {
    const skillMd = join(skillsDir, entry, "SKILL.md");
    if (!existsSync(skillMd) || !safeIsFile(skillMd)) {
      continue;
    }
    const meta = parseFrontmatterNameDescription(safeRead(skillMd));
    const name = (meta.name || entry).trim().toLowerCase();
    if (!name || isColcoorSlashName(name) || seen.has(name)) {
      continue;
    }
    seen.add(name);
    out.push({
      name,
      description: meta.description || `Skill: ${name}`,
      argumentHint: meta.argumentHint,
      source: "skill",
      execution: "provider",
      availability: { kind: "available" },
    });
  }
  return out;
}

function discoverInClaudeRoot(root: string): SlashCommand[] {
  const out: SlashCommand[] = [];
  const seen = new Set<string>();

  for (const cmd of discoverSkillsInDir(join(root, ".claude", "skills"))) {
    const key = cmd.name.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(cmd);
  }

  const commandsDir = join(root, ".claude", "commands");
  if (existsSync(commandsDir) && safeIsDir(commandsDir)) {
    for (const entry of safeReaddir(commandsDir)) {
      if (!entry.endsWith(".md")) {
        continue;
      }
      const path = join(commandsDir, entry);
      if (!safeIsFile(path)) {
        continue;
      }
      const base = entry.slice(0, -3);
      const meta = parseFrontmatterNameDescription(safeRead(path));
      const name = (meta.name || base).trim().toLowerCase();
      if (!name || isColcoorSlashName(name) || seen.has(name)) {
        continue;
      }
      seen.add(name);
      out.push({
        name,
        description: meta.description || `Command: ${name}`,
        argumentHint: meta.argumentHint,
        source: "provider",
        execution: "provider",
        availability: { kind: "available" },
      });
    }
  }

  return out;
}

/** Convert SDK `SlashCommand`-like objects into Colcoor catalog entries. */
export function providerCommandsFromSdk(
  commands: Array<{
    name?: string;
    description?: string;
    argumentHint?: string;
    aliases?: string[];
  }>,
): SlashCommand[] {
  const out: SlashCommand[] = [];
  const seen = new Set<string>();
  for (const c of commands) {
    const name = (c.name ?? "").trim().toLowerCase();
    if (!name || isColcoorSlashName(name) || seen.has(name)) {
      continue;
    }
    seen.add(name);
    const desc = (c.description ?? "").trim() || name;
    // Prefer "provider" for built-ins; skills usually come from disk SKILL.md discovery.
    const looksLikeSkill = /\bskill\b/i.test(desc) && !/alias of/i.test(desc);
    out.push({
      name,
      description: desc,
      argumentHint: c.argumentHint?.trim() || undefined,
      source: looksLikeSkill ? "skill" : "provider",
      execution: "provider",
      availability: { kind: "available" },
    });
    for (const alias of c.aliases ?? []) {
      const a = alias.trim().toLowerCase().replace(/^\//, "");
      if (!a || isColcoorSlashName(a) || seen.has(a)) {
        continue;
      }
      seen.add(a);
      out.push({
        name: a,
        description: `Alias of /${name} — ${desc}`,
        argumentHint: c.argumentHint?.trim() || undefined,
        source: looksLikeSkill ? "skill" : "provider",
        execution: "provider",
        availability: { kind: "available" },
      });
    }
  }
  return out;
}

function parseFrontmatterNameDescription(raw: string): {
  name?: string;
  description?: string;
  argumentHint?: string;
} {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) {
    return {};
  }
  const block = m[1] ?? "";
  const name = matchYamlScalar(block, "name");
  const description = matchYamlScalar(block, "description");
  const argumentHint =
    matchYamlScalar(block, "argument-hint") || matchYamlScalar(block, "argumentHint");
  return { name, description, argumentHint };
}

/**
 * Parse a YAML scalar that may be:
 * - `key: value`
 * - `key: "quoted"`
 * - `key: >-` / `|` folded/literal block with indented continuation lines
 */
function matchYamlScalar(block: string, key: string): string | undefined {
  const re = new RegExp(`^${key}:\\s*(.*)$`, "im");
  const m = block.match(re);
  if (!m) {
    return undefined;
  }
  let v = (m[1] ?? "").trim();
  if (!v || v === ">" || v === ">-" || v === "|" || v === "|-") {
    // Folded/literal block: collect following indented lines.
    const lines = block.split(/\r?\n/);
    const keyLineIdx = lines.findIndex((line) => new RegExp(`^${key}:\\s*`, "i").test(line));
    if (keyLineIdx < 0) {
      return undefined;
    }
    const collected: string[] = [];
    for (let i = keyLineIdx + 1; i < lines.length; i++) {
      const line = lines[i] ?? "";
      if (/^\S/.test(line)) {
        break;
      }
      const trimmed = line.replace(/^\s+/, "");
      if (trimmed) {
        collected.push(trimmed);
      }
    }
    const joined = collected.join(" ").trim();
    return joined || undefined;
  }
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1);
  }
  return v.trim() || undefined;
}

function safeIsDir(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function safeIsFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

function safeReaddir(path: string): string[] {
  try {
    return readdirSync(path);
  } catch {
    return [];
  }
}

function safeRead(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}
