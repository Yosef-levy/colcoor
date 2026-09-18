import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { buildSlashCommandCatalog } from "./registry";
import {
  resolveProviderCommandCatalog,
  clearProviderCommandCatalogCache,
} from "./providerCommandCatalog";
import { seedProviderCommands } from "./seedProviderCommands";
import { discoverLocalProviderCommands } from "./discoverLocalCommands";
import type { SlashCommandContext } from "./types";

describe("seedProviderCommands", () => {
  it("seeds Claude built-ins for Anthropic", () => {
    const seeded = seedProviderCommands("anthropic");
    expect(seeded.map((c) => c.name)).toEqual(
      expect.arrayContaining(["context", "compact", "usage", "help", "init"]),
    );
  });

  it("does not seed Claude built-ins for Cursor", () => {
    const seeded = seedProviderCommands("cursor");
    expect(seeded).toEqual([]);
    expect(seeded.map((c) => c.name)).not.toContain("help");
    expect(seeded.map((c) => c.name)).not.toContain("init");
  });
});

describe("resolveProviderCommandCatalog Cursor skills", () => {
  it("Cursor catalog excludes seeded /help and /init; includes disk Skills", () => {
    clearProviderCommandCatalogCache();
    const home = mkdtempSync(join(tmpdir(), "colcoor-seed-home-"));
    const workspace = mkdtempSync(join(tmpdir(), "colcoor-seed-ws-"));
    mkdirSync(join(home, ".cursor", "skills-cursor", "create-hook"), { recursive: true });
    writeFileSync(
      join(home, ".cursor", "skills-cursor", "create-hook", "SKILL.md"),
      "---\nname: create-hook\ndescription: Create a Cursor hook\n---\nHook.\n",
    );

    // resolveProviderCommandCatalog uses real home; assert discovery + seeds separately
    // then build catalog the same way resolve merges.
    const disk = discoverLocalProviderCommands(workspace, { homeDir: home });
    expect(disk.map((c) => c.name)).toContain("create-hook");

    const catalog = resolveProviderCommandCatalog(workspace, "cursor");
    expect(catalog.map((c) => c.name)).not.toContain("help");
    expect(catalog.map((c) => c.name)).not.toContain("init");
  });
});

describe("buildSlashCommandCatalog Cursor reflection", () => {
  it("lists Cursor disk skills as available (CLI pass-through)", () => {
    clearProviderCommandCatalogCache();
    const home = mkdtempSync(join(tmpdir(), "colcoor-cat-home-"));
    const workspace = mkdtempSync(join(tmpdir(), "colcoor-cat-ws-"));
    mkdirSync(join(home, ".cursor", "skills-cursor", "babysit"), { recursive: true });
    writeFileSync(
      join(home, ".cursor", "skills-cursor", "babysit", "SKILL.md"),
      "---\nname: babysit\ndescription: Keep a PR merge-ready\n---\nGo.\n",
    );

    const providerCommands = discoverLocalProviderCommands(workspace, { homeDir: home });
    const ctx: SlashCommandContext = {
      conversationId: "c1",
      providerId: "cursor",
      cliMode: "agent",
      agentMode: "auto",
      workspaceRoot: workspace,
      capabilities: {
        supportsProviderCommands: true,
        supportsSkills: true,
        supportsProviderContext: false,
        supportsDisallowedTools: false,
      },
      selectedModel: "auto",
      modelOptions: [],
      providerCommands,
    };
    const catalog = buildSlashCommandCatalog(ctx);
    const babysit = catalog.find((c) => c.name === "babysit");
    expect(babysit?.availability).toEqual({ kind: "available" });
    expect(catalog.find((c) => c.name === "help")).toBeUndefined();
    expect(catalog.find((c) => c.name === "init")).toBeUndefined();
  });
});

describe("buildSlashCommandCatalog provider reflection", () => {
  it("lists Anthropic built-ins as unavailable in Ask mode", () => {
    clearProviderCommandCatalogCache();
    const providerCommands = resolveProviderCommandCatalog("/tmp/nonexistent-colcoor-ws", "anthropic");
    const ctx: SlashCommandContext = {
      conversationId: "c1",
      providerId: "anthropic",
      cliMode: "ask",
      agentMode: "auto",
      workspaceRoot: "/tmp/nonexistent-colcoor-ws",
      capabilities: {
        supportsProviderCommands: false,
        supportsSkills: false,
        supportsProviderContext: false,
        supportsDisallowedTools: false,
      },
      selectedModel: "auto",
      modelOptions: [],
      providerCommands,
    };
    const catalog = buildSlashCommandCatalog(ctx);
    const context = catalog.find((c) => c.name === "context");
    expect(context).toBeDefined();
    expect(context?.availability.kind).toBe("unavailable");
    expect(context?.availability.kind === "unavailable" && context.availability.reason).toMatch(
      /Plan or Agent/i,
    );
  });

  it("lists Anthropic built-ins as available in Agent mode", () => {
    clearProviderCommandCatalogCache();
    const providerCommands = resolveProviderCommandCatalog("/tmp/nonexistent-colcoor-ws", "anthropic");
    const ctx: SlashCommandContext = {
      conversationId: "c1",
      providerId: "anthropic",
      cliMode: "agent",
      agentMode: "auto",
      workspaceRoot: "/tmp/nonexistent-colcoor-ws",
      capabilities: {
        supportsProviderCommands: true,
        supportsSkills: true,
        supportsProviderContext: true,
        supportsDisallowedTools: true,
      },
      selectedModel: "auto",
      modelOptions: [],
      providerCommands,
    };
    const catalog = buildSlashCommandCatalog(ctx);
    const context = catalog.find((c) => c.name === "context");
    expect(context?.availability).toEqual({ kind: "available" });
  });
});
