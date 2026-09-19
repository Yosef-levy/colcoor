import { spawn } from "node:child_process";
import { Readable, Writable } from "node:stream";
import * as acp from "@agentclientprotocol/sdk";

import { appendTimelineEntry } from "../cursorAgentTimelineSanitize";
import { processEnvForAgentCli } from "../agentPathEnv";
import type { AgentDisplayPart } from "../cursorAgentStreamJson";
import type { SlashCommand } from "../../commands/slash/types";
import { bridgeAcpToolApproval } from "./providerToolApproval";

export const PINNED_GEMINI_CLI_VERSION = "0.60.0";

export type GeminiAcpRunOptions = {
  executable: string;
  cwd: string;
  prompt: string;
  model?: string;
  sessionId?: string;
  approvalMode: "plan" | "default" | "autoEdit" | "yolo";
  apiKey?: string;
  signal?: AbortSignal;
  branchLabel?: string;
  allowPersistentOptions: boolean;
  onTextDelta?: (text: string) => void;
  onDisplayParts?: (parts: AgentDisplayPart[]) => void;
  onCommandsChanged?: (commands: SlashCommand[]) => void;
};

export type GeminiAcpRunResult = {
  text: string;
  sessionId: string;
  stopReason: string;
  usage?: acp.Usage | null;
  meta?: Record<string, unknown> | null;
  timeline: unknown[];
  displayParts: AgentDisplayPart[];
  cancelled: boolean;
};

function approvalModeFlag(mode: GeminiAcpRunOptions["approvalMode"]): string {
  return mode === "autoEdit" ? "auto_edit" : mode;
}

function cloneParts(parts: AgentDisplayPart[]): AgentDisplayPart[] {
  return parts.map((part) =>
    part.kind === "assistant"
      ? { kind: "assistant", text: part.text }
      : { kind: "activity", entries: [...part.entries] },
  );
}

function toolRows(update: acp.SessionUpdate): Record<string, unknown>[] {
  if (update.sessionUpdate !== "tool_call" && update.sessionUpdate !== "tool_call_update") return [];
  const title =
    "title" in update && typeof update.title === "string" ? update.title : "Gemini tool call";
  const kind = "kind" in update ? update.kind : undefined;
  const content = "content" in update && Array.isArray(update.content) ? update.content : [];
  const diff = content.find((item) => item.type === "diff");
  if (diff?.type === "diff") {
    return [{ colcoor_row: "edit_diff", path: diff.path, diff: diff.newText ?? "" }];
  }
  if (kind === "execute") {
    return [
      {
        colcoor_row: update.status === "completed" ? "shell_done" : "shell_start",
        text: title,
      },
    ];
  }
  return [{ colcoor_row: "read", text: title }];
}

function commandsFromUpdate(update: acp.AvailableCommandsUpdate): SlashCommand[] {
  return update.availableCommands.map((command) => ({
    name: command.name.replace(/^\//, ""),
    description: command.description,
    ...(command.input?.hint ? { argumentHint: command.input.hint } : {}),
    source: "provider",
    execution: "provider",
    availability: { kind: "available" },
  }));
}

function cancelledPermission(signal?: AbortSignal): Promise<acp.RequestPermissionResponse> {
  if (signal?.aborted) return Promise.resolve({ outcome: { outcome: "cancelled" } });
  return new Promise((resolve) => {
    signal?.addEventListener(
      "abort",
      () => resolve({ outcome: { outcome: "cancelled" } }),
      { once: true },
    );
  });
}

export async function runGeminiAcpTurn(options: GeminiAcpRunOptions): Promise<GeminiAcpRunResult> {
  const args = [
    "--acp",
    "--approval-mode",
    approvalModeFlag(options.approvalMode),
    ...(options.model?.trim() ? ["--model", options.model.trim()] : []),
  ];
  const child = spawn(options.executable, args, {
    cwd: options.cwd,
    shell: false,
    windowsHide: true,
    stdio: ["pipe", "pipe", "pipe"],
    env: {
      ...processEnvForAgentCli(),
      ...(options.apiKey ? { GEMINI_API_KEY: options.apiKey } : {}),
    },
  });
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => {
    stderr += chunk;
  });

  const stream = acp.ndJsonStream(
    Writable.toWeb(child.stdin) as WritableStream<Uint8Array>,
    Readable.toWeb(child.stdout) as ReadableStream<Uint8Array>,
  );
  let text = "";
  let activeSessionId = options.sessionId ?? "";
  let acceptOutput = false;
  const timeline: unknown[] = [];
  const displayParts: AgentDisplayPart[] = [];

  const publishParts = (): void => options.onDisplayParts?.(cloneParts(displayParts));
  const appendText = (delta: string): void => {
    if (!delta || !acceptOutput) return;
    text += delta;
    const last = displayParts[displayParts.length - 1];
    if (last?.kind === "assistant") last.text += delta;
    else displayParts.push({ kind: "assistant", text: delta });
    options.onTextDelta?.(text);
    publishParts();
  };
  const appendActivity = (rows: Record<string, unknown>[]): void => {
    if (!acceptOutput || rows.length === 0) return;
    for (const row of rows) appendTimelineEntry(timeline, row);
    const last = displayParts[displayParts.length - 1];
    if (last?.kind === "activity") last.entries.push(...rows);
    else displayParts.push({ kind: "activity", entries: [...rows] });
    publishParts();
  };

  const client: acp.Client = {
    async requestPermission(request) {
      return Promise.race([
        bridgeAcpToolApproval(
          request,
          options.branchLabel,
          options.allowPersistentOptions,
          options.signal,
        ),
        cancelledPermission(options.signal),
      ]);
    },
    sessionUpdate(notification) {
      const update = notification.update;
      if (update.sessionUpdate === "agent_message_chunk" && update.content.type === "text") {
        appendText(update.content.text);
      } else if (update.sessionUpdate === "agent_thought_chunk") {
        if (update.content.type === "text") {
          appendActivity([{ colcoor_row: "read", text: `Thought: ${update.content.text}` }]);
        }
      } else if (
        update.sessionUpdate === "tool_call" ||
        update.sessionUpdate === "tool_call_update"
      ) {
        appendActivity(toolRows(update));
      } else if (update.sessionUpdate === "available_commands_update") {
        options.onCommandsChanged?.(commandsFromUpdate(update));
      }
    },
  };
  const connection = new acp.ClientSideConnection(() => client, stream);
  const onAbort = (): void => {
    if (activeSessionId) void connection.cancel({ sessionId: activeSessionId });
  };
  options.signal?.addEventListener("abort", onAbort, { once: true });

  try {
    const initialized = await connection.initialize({
      protocolVersion: acp.PROTOCOL_VERSION,
      clientCapabilities: {},
      clientInfo: { name: "colcoor", version: "0.0.1" },
    });
    if (!initialized.agentCapabilities?.loadSession && options.sessionId) {
      throw new Error("Gemini CLI ACP does not advertise loadSession support.");
    }

    let modes: acp.SessionModeState | null | undefined;
    if (options.sessionId) {
      const loaded = await connection.loadSession({
        sessionId: options.sessionId,
        cwd: options.cwd,
        mcpServers: [],
      });
      modes = loaded?.modes;
    } else {
      const created = await connection.newSession({ cwd: options.cwd, mcpServers: [] });
      activeSessionId = created.sessionId;
      modes = created.modes;
    }
    const available = modes?.availableModes.map((mode) => mode.id) ?? [];
    if (!available.includes(options.approvalMode)) {
      throw new Error(
        `Gemini CLI ACP mode "${options.approvalMode}" is unavailable` +
          (available.length ? ` (available: ${available.join(", ")})` : "."),
      );
    }
    await connection.setSessionMode({
      sessionId: activeSessionId,
      modeId: options.approvalMode,
    });
    acceptOutput = true;
    const response = await connection.prompt({
      sessionId: activeSessionId,
      prompt: [{ type: "text", text: options.prompt }],
    });
    return {
      text,
      sessionId: activeSessionId,
      stopReason: response.stopReason,
      usage: response.usage,
      meta: response._meta,
      timeline,
      displayParts,
      cancelled: response.stopReason === "cancelled" || options.signal?.aborted === true,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (options.signal?.aborted) {
      return {
        text,
        sessionId: activeSessionId,
        stopReason: "cancelled",
        timeline,
        displayParts,
        cancelled: true,
      };
    }
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
      throw new Error(
        `Gemini CLI executable "${options.executable}" was not found. ` +
          `Install the supported CLI with "npm install -g @google/gemini-cli@${PINNED_GEMINI_CLI_VERSION}" ` +
          "or set colcoor.geminiExecutable.",
      );
    }
    throw new Error(`${message}${stderr.trim() ? `\n${stderr.trim()}` : ""}`);
  } finally {
    options.signal?.removeEventListener("abort", onAbort);
    child.kill();
  }
}
