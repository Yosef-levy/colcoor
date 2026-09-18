import { describe, expect, it } from "vitest";

import { COLCOOR_SLASH_COMMANDS } from "./colcoorCommands";
import { dispatchSlashCommand } from "./dispatch";
import { buildSlashCommandCatalog } from "./registry";
import type { SlashCommand, SlashCommandContext } from "./types";

function ctx(partial?: Partial<SlashCommandContext>): SlashCommandContext {
  return {
    conversationId: "c1",
    providerId: "anthropic",
    cliMode: "ask",
    agentMode: "auto",
    workspaceRoot: "/tmp/ws",
    capabilities: {
      supportsProviderCommands: false,
      supportsSkills: false,
      supportsProviderContext: false,
      supportsDisallowedTools: false,
    },
    selectedModel: "auto",
    modelOptions: [{ id: "auto", label: "Auto" }],
    providerCommands: [],
    contextSummaryLines: ["- tokens: 1"],
    ...partial,
  };
}

describe("dispatchSlashCommand", () => {
  it("returns null for ordinary messages", () => {
    expect(dispatchSlashCommand({ text: "hello", ctx: ctx() })).toBeNull();
  });

  it("handles /colcoor-help as local output listing Colcoor commands", () => {
    const result = dispatchSlashCommand({ text: "/colcoor-help", ctx: ctx() });
    expect(result?.action).toBe("local");
    if (result?.action === "local") {
      expect(result.message).toContain("/colcoor-help");
      expect(result.message).toContain("/colcoor-context");
      expect(result.message).not.toContain("\n- `/help`");
    }
  });

  it("handles /colcoor-context from Colcoor summary lines", () => {
    const result = dispatchSlashCommand({ text: "/colcoor-context", ctx: ctx() });
    expect(result?.action).toBe("local");
    if (result?.action === "local") {
      expect(result.message).toContain("Colcoor context");
      expect(result.message).toContain("tokens: 1");
    }
  });

  it("transforms /colcoor-agent with remaining body", () => {
    const result = dispatchSlashCommand({
      text: "/colcoor-agent do the thing",
      ctx: ctx(),
    });
    expect(result).toEqual({
      action: "turn-transform",
      userMessage: "do the thing",
      patch: { cliMode: "agent" },
    });
  });

  it("sets mode only when /colcoor-plan has no body", () => {
    const result = dispatchSlashCommand({ text: "/colcoor-plan", ctx: ctx() });
    expect(result?.action).toBe("turn-transform");
    if (result?.action === "turn-transform") {
      expect(result.userMessage).toBe("");
      expect(result.patch.cliMode).toBe("plan");
      expect(result.message).toContain("Plan");
    }
  });

  it("requires a body for /colcoor-private", () => {
    const empty = dispatchSlashCommand({ text: "/colcoor-private", ctx: ctx() });
    expect(empty?.action).toBe("error");
    const ok = dispatchSlashCommand({ text: "/colcoor-private secret", ctx: ctx() });
    expect(ok).toEqual({
      action: "turn-transform",
      userMessage: "secret",
      patch: { privateBranch: true },
    });
  });

  it("routes /colcoor-resend", () => {
    expect(dispatchSlashCommand({ text: "/colcoor-resend", ctx: ctx() })?.action).toBe("resend");
  });

  it("rejects provider-native commands in Ask mode", () => {
    const result = dispatchSlashCommand({ text: "/context", ctx: ctx() });
    expect(result?.action).toBe("error");
    if (result?.action === "error") {
      expect(result.message).toContain("colcoor-help");
      expect(result.message).toMatch(/Plan\/Agent/i);
    }
  });

  it("forwards provider-native commands when capabilities allow", () => {
    const result = dispatchSlashCommand({
      text: "/deploy staging",
      ctx: ctx({
        cliMode: "agent",
        capabilities: {
          supportsProviderCommands: true,
          supportsSkills: true,
          supportsProviderContext: true,
          supportsDisallowedTools: true,
        },
        providerCommands: [
          {
            name: "deploy",
            description: "Deploy",
            source: "skill",
            execution: "provider",
            availability: { kind: "available" },
          },
        ],
      }),
    });
    expect(result).toEqual({
      action: "provider",
      userMessage: "/deploy staging",
      slashMeta: { command: "deploy", args: "staging", source: "skill" },
    });
  });

  it("never aliases Colcoor commands to unprefixed names", () => {
    const names = new Set(COLCOOR_SLASH_COMMANDS.map((c) => c.name));
    for (const n of names) {
      expect(n.startsWith("colcoor-")).toBe(true);
    }
    const catalog = buildSlashCommandCatalog(ctx());
    expect(catalog.some((c) => c.name === "help")).toBe(false);
  });
});

describe("buildSlashCommandCatalog collisions", () => {
  it("drops provider commands that collide with /colcoor-*", () => {
    const rogue: SlashCommand = {
      name: "colcoor-help",
      description: "rogue",
      source: "provider",
      execution: "provider",
      availability: { kind: "available" },
    };
    const catalog = buildSlashCommandCatalog(
      ctx({
        cliMode: "agent",
        capabilities: {
          supportsProviderCommands: true,
          supportsSkills: true,
          supportsProviderContext: true,
          supportsDisallowedTools: true,
        },
        providerCommands: [rogue],
      }),
    );
    const help = catalog.filter((c) => c.name === "colcoor-help");
    expect(help).toHaveLength(1);
    expect(help[0]?.source).toBe("colcoor");
  });
});
