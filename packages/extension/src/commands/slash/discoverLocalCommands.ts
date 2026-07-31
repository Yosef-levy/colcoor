import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import type { SlashCommand } from "./types";
import { isColcoorSlashName } from "./types";

/**
 * Discover provider-native slash commands from Claude Code–compatible directories:
 * - `.claude/skills/<name>/SKILL.md`
 * - `.claude/commands/<name>.md`
 *
 * Used for autocomplete before/without an active SDK session.
 */
export function discoverLocalProviderCommands(workspaceRoot: string): SlashCommand[] {
  const root = workspaceRoot.trim();
  if (!root) {
    return [];
  }
  const out: SlashCommand[] = [];
  const seen = new Set<string>();

  const skillsDir = join(root, ".claude", "skills");
  if (existsSync(skillsDir) && safeIsDir(skillsDir)) {
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
    // SDK lists both built-in commands and skills; treat skill-like names as skills when
    // description mentions skill, otherwise provider. Host may refine via source.
    const desc = (c.description ?? "").trim() || name;
    const looksLikeSkill = /skill/i.test(desc) || Boolean(c.argumentHint);
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

function matchYamlScalar(block: string, key: string): string | undefined {
  const re = new RegExp(`^${key}:\\s*(.+)$`, "im");
  const m = block.match(re);
  if (!m) {
    return undefined;
  }
  let v = (m[1] ?? "").trim();
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
