import { normalizeCursorCliMode, type CursorCliMode } from "../../agent/cursorCliMode";
import { colcoorSlashCommandByName } from "./colcoorCommands";
import { parseSlashCommand } from "./parseSlashCommand";
import { buildSlashCommandCatalog } from "./registry";
import {
  isColcoorSlashName,
  slashDisplayName,
  type SlashCommand,
  type SlashCommandContext,
  type SlashCommandResult,
  type SlashInvocation,
} from "./types";

export type DispatchSlashInput = {
  text: string;
  ctx: SlashCommandContext;
};

/**
 * Parse and dispatch a composer message that may be a slash command.
 * Returns null when the text is ordinary chat (no leading slash command).
 */
export function dispatchSlashCommand(input: DispatchSlashInput): SlashCommandResult | null {
  const invocation = parseSlashCommand(input.text);
  if (!invocation) {
    return null;
  }
  return executeSlashInvocation(invocation, input.ctx);
}

export function executeSlashInvocation(
  invocation: SlashInvocation,
  ctx: SlashCommandContext,
): SlashCommandResult {
  const name = invocation.name.toLowerCase();
  const catalog = buildSlashCommandCatalog(ctx);
  const match = catalog.find((c) => c.name === name);

  if (isColcoorSlashName(name)) {
    return executeColcoorCommand(name, invocation, ctx, catalog);
  }

  if (!match) {
    if (ctx.capabilities.supportsProviderCommands || ctx.capabilities.supportsSkills) {
      // Unknown to catalog but backend may still accept it — forward as provider invocation.
      return {
        action: "provider",
        userMessage: invocation.rawText,
        slashMeta: {
          command: name,
          args: invocation.args,
          source: "provider",
        },
      };
    }
    return {
      action: "error",
      message:
        `Unknown command \`/${name}\`. Try \`/colcoor-help\` for Colcoor commands.` +
        (ctx.capabilities.supportsProviderCommands
          ? ""
          : " Provider-native commands (e.g. `/context`) require Anthropic Plan/Agent mode."),
    };
  }

  if (match.availability.kind === "unavailable") {
    return { action: "error", message: match.availability.reason };
  }

  return {
    action: "provider",
    userMessage: invocation.rawText,
    slashMeta: {
      command: name,
      args: invocation.args,
      source: match.source,
    },
  };
}

function executeColcoorCommand(
  name: string,
  invocation: SlashInvocation,
  ctx: SlashCommandContext,
  catalog: SlashCommand[],
): SlashCommandResult {
  const def = colcoorSlashCommandByName(name);
  if (!def) {
    return {
      action: "error",
      message: `Unknown Colcoor command \`/${name}\`. Try \`/colcoor-help\`.`,
    };
  }

  switch (name) {
    case "colcoor-help":
      return { action: "local", message: formatHelp(catalog, ctx) };
    case "colcoor-context":
      return {
        action: "local",
        message: formatContext(ctx),
      };
    case "colcoor-skills":
      return { action: "local", message: formatSkills(catalog, ctx) };
    case "colcoor-model":
      return handleModel(invocation.args, ctx);
    case "colcoor-ask":
      return handleModeTransform("ask", invocation.args);
    case "colcoor-plan":
      return handleModeTransform("plan", invocation.args);
    case "colcoor-agent":
      return handleModeTransform("agent", invocation.args);
    case "colcoor-private":
      return handlePrivate(invocation.args);
    case "colcoor-resend":
      return { action: "resend", message: "Resending selected assistant message…" };
    default:
      return {
        action: "error",
        message: `Unhandled Colcoor command \`/${name}\`.`,
      };
  }
}

function handleModeTransform(mode: CursorCliMode, args: string): SlashCommandResult {
  const body = args.trim();
  const label = mode.charAt(0).toUpperCase() + mode.slice(1);
  if (!body) {
    return {
      action: "turn-transform",
      userMessage: "",
      patch: { cliMode: mode },
      message: `Mode set to **${label}**.`,
    };
  }
  return {
    action: "turn-transform",
    userMessage: body,
    patch: { cliMode: mode },
  };
}

function handlePrivate(args: string): SlashCommandResult {
  const body = args.trim();
  if (!body) {
    return {
      action: "error",
      message: "`/colcoor-private` requires a message. Example: `/colcoor-private draft this idea`",
    };
  }
  return {
    action: "turn-transform",
    userMessage: body,
    patch: { privateBranch: true },
  };
}

function handleModel(args: string, ctx: SlashCommandContext): SlashCommandResult {
  const want = args.trim();
  if (!want) {
    const lines = [
      `**Current model:** \`${ctx.selectedModel || "auto"}\``,
      "",
      "Set with `/colcoor-model <id>` or `/colcoor-model auto`.",
    ];
    if (ctx.modelOptions.length > 0) {
      lines.push("", "**Available models:**");
      for (const m of ctx.modelOptions.slice(0, 40)) {
        lines.push(`- \`${m.id}\`${m.label && m.label !== m.id ? ` — ${m.label}` : ""}`);
      }
    }
    return { action: "local", message: lines.join("\n") };
  }
  const id = want.toLowerCase() === "auto" ? "auto" : want;
  if (id !== "auto" && ctx.modelOptions.length > 0) {
    const known = ctx.modelOptions.some((m) => m.id === id);
    if (!known) {
      // Still allow setting — full picker may have more models than the curated list.
      return {
        action: "turn-transform",
        userMessage: "",
        patch: { cliModel: id },
        message: `Model set to \`${id}\` (not in the curated dropdown; will be used on the next send).`,
      };
    }
  }
  return {
    action: "turn-transform",
    userMessage: "",
    patch: { cliModel: id },
    message: `Model set to \`${id}\`.`,
  };
}

function formatHelp(catalog: SlashCommand[], ctx: SlashCommandContext): string {
  const lines = [
    "**Colcoor slash commands**",
    "",
    "Colcoor-owned commands always use the `/colcoor-` prefix. Provider-native commands keep their own names.",
    "",
    `Provider: \`${ctx.providerId}\` · Mode: \`${normalizeCursorCliMode(ctx.cliMode)}\``,
    "",
  ];
  const colcoor = catalog.filter((c) => c.source === "colcoor");
  const provider = catalog.filter((c) => c.source !== "colcoor");
  lines.push("### Colcoor");
  for (const c of colcoor) {
    lines.push(formatCatalogLine(c));
  }
  if (provider.length > 0) {
    lines.push("", "### Provider / skills");
    for (const c of provider) {
      lines.push(formatCatalogLine(c));
    }
  } else if (!ctx.capabilities.supportsProviderCommands) {
    lines.push(
      "",
      "_Provider-native commands and skills are available in Anthropic Plan/Agent mode (Claude Agent SDK)._",
    );
  }
  return lines.join("\n");
}

function formatSkills(catalog: SlashCommand[], ctx: SlashCommandContext): string {
  const skills = catalog.filter((c) => c.source === "skill" || c.source === "provider");
  if (!ctx.capabilities.supportsSkills && !ctx.capabilities.supportsProviderCommands) {
    return [
      "**Skills**",
      "",
      "Skills and provider slash commands require **Anthropic** provider in **Plan** or **Agent** mode (Claude Agent SDK).",
      "",
      `Current: provider=\`${ctx.providerId}\`, mode=\`${ctx.cliMode}\`.`,
      "",
      "Use `/colcoor-plan` or `/colcoor-agent` to switch, then run `/colcoor-skills` again.",
    ].join("\n");
  }
  if (skills.length === 0) {
    return [
      "**Skills / provider commands**",
      "",
      "No provider commands discovered yet. They appear after a Claude Agent SDK session starts, or when `.claude/skills` / `.claude/commands` are present in the workspace.",
      "",
      "Invoke a skill with `/skill-name` (provider-native, not `/colcoor-…`).",
    ].join("\n");
  }
  const lines = ["**Skills / provider commands**", ""];
  for (const c of skills) {
    lines.push(formatCatalogLine(c));
  }
  lines.push("", "Invoke with `/name` (provider-native names, not the `/colcoor-` prefix).");
  return lines.join("\n");
}

function formatContext(ctx: SlashCommandContext): string {
  const lines = ctx.contextSummaryLines?.length
    ? ctx.contextSummaryLines
    : [
        "No context-savings data recorded for this conversation yet.",
        "Send a message to start tracking branch context savings.",
      ];
  return ["**Colcoor context**", "", ...lines].join("\n");
}

function formatCatalogLine(c: SlashCommand): string {
  const hint = c.argumentHint ? ` ${c.argumentHint}` : "";
  const avail =
    c.availability.kind === "unavailable" ? ` _(unavailable: ${c.availability.reason})_` : "";
  return `- \`${slashDisplayName(c.name)}${hint}\` — ${c.description}${avail}`;
}
