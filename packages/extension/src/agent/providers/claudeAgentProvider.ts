import * as vscode from "vscode";

import { updateProviderCommandCatalogFromSdk } from "../../commands/slash/providerCommandCatalog";
import { normalizePersistedUserInputText } from "../../conversation/normalizeUserInputText";
import { enqueueToolCallApproval } from "../cursorToolCallApprovalQueue";
import { SECRET_ANTHROPIC_API_KEY } from "../providerApiKey";
import {
  agentSessionToContinuation,
  normalizeProviderMode,
  providerUsageFromSdkResult,
  type SdkResultUsageCapture,
} from "../../conversation/messageProviderUsage";
import { resolveAgentModel, resolveRunModel } from "./anthropicConfig";
import type { AgentBackend, AgentBackendRunInput, AgentRunResult, AgentSessionPlan } from "./types";

type SdkSlashCommand = {
  name: string;
  description: string;
  argumentHint: string;
  aliases?: string[];
};

/** Minimal surface of `@anthropic-ai/claude-agent-sdk` that Colcoor depends on. */
type ClaudeAgentSdk = {
  query: (args: { prompt: string; options?: Record<string, unknown> }) => ClaudeAgentQuery;
  forkSession?: (
    sessionId: string,
    options?: { upToId?: string; dir?: string },
  ) => Promise<{ sessionId: string }>;
};

/**
 * Query is both an AsyncIterable and a control surface (`supportedCommands`, etc.).
 * We retain the object instead of narrowing to AsyncIterable so slash-command discovery works.
 */
type ClaudeAgentQuery = AsyncIterable<SdkMessage> & {
  supportedCommands?: () => Promise<SdkSlashCommand[]>;
};

type SdkMessage = SdkResultUsageCapture & {
  type?: string;
  subtype?: string;
  uuid?: string;
  session_id?: string;
  result?: string;
  message?: { content?: Array<{ type?: string; text?: string }> };
  commands?: SdkSlashCommand[];
};

let sdkPromise: Promise<ClaudeAgentSdk> | undefined;

async function loadSdk(): Promise<ClaudeAgentSdk> {
  if (!sdkPromise) {
    sdkPromise = import("@anthropic-ai/claude-agent-sdk").then(
      (m) => m as unknown as ClaudeAgentSdk,
      (e) => {
        sdkPromise = undefined;
        const msg = e instanceof Error ? e.message : String(e);
        throw new Error(
          "Colcoor: could not load the Claude Agent SDK. Ensure the extension was installed " +
            `for this platform (native binary), or switch ask/agent to a lighter mode. ${msg}`,
        );
      },
    );
  }
  return sdkPromise;
}

/**
 * The prompt to send: full transcript for a fresh session, otherwise just the new user message.
 * Provider-native slash commands (`/context`, `/skill-name`) are passed as `userMessage` on
 * resume/fork so they are not buried inside a re-sent transcript.
 */
function promptForPlan(input: AgentBackendRunInput, plan: AgentSessionPlan): string {
  const appendix = input.workspaceContextAppendix ?? "";
  if (plan.kind === "fresh") {
    // Prefer raw slash invocation as the prompt when this turn is a provider command on a fresh session,
    // so `/context` is not buried after a long transcript.
    if (input.providerSlashCommand?.trim()) {
      const cmd = input.providerSlashCommand.trim();
      return appendix ? `${cmd}${appendix}` : cmd;
    }
    return appendix ? `${input.transcriptText}${appendix}` : input.transcriptText;
  }
  const base = input.userMessage.trim() || input.transcriptText;
  return appendix ? `${base}${appendix}` : base;
}

function formatToolInputDetail(input: Record<string, unknown>): string {
  const preferredKeys = [
    "file_path",
    "path",
    "filePath",
    "command",
    "pattern",
    "url",
    "query",
    "notebook_path",
  ];
  const lines: string[] = [];
  for (const key of preferredKeys) {
    const v = input[key];
    if (typeof v === "string" && v.trim()) {
      lines.push(`${key}: ${v.trim().slice(0, 400)}`);
    }
  }
  const content = input.content ?? input.new_string ?? input.new_str ?? input.text;
  if (typeof content === "string" && content.trim()) {
    const preview = content.trim().replace(/\s+/g, " ").slice(0, 240);
    lines.push(`content preview: ${preview}${content.trim().length > 240 ? "…" : ""}`);
  }
  if (lines.length === 0) {
    try {
      const raw = JSON.stringify(input);
      if (raw && raw !== "{}") {
        lines.push(raw.length > 500 ? `${raw.slice(0, 500)}…` : raw);
      }
    } catch {
      /* ignore */
    }
  }
  return lines.join("\n");
}

async function bridgeToolApproval(
  toolName: string,
  input: Record<string, unknown>,
  options: { title?: string; blockedPath?: string; decisionReason?: string } | undefined,
  branchLabel: string | undefined,
): Promise<{ behavior: "allow" } | { behavior: "deny"; message: string }> {
  return enqueueToolCallApproval(async () => {
    const branchLine = branchLabel?.trim() ? `Reply branch: ${branchLabel.trim()}` : "";
    const title =
      typeof options?.title === "string" && options.title.trim()
        ? options.title.trim()
        : `Agent wants to use "${toolName}"`;
    const detail = formatToolInputDetail(input ?? {});
    const extras: string[] = [];
    if (options?.blockedPath) extras.push(`Blocked path: ${options.blockedPath}`);
    if (options?.decisionReason) extras.push(`Reason: ${options.decisionReason}`);
    const body = ["Colcoor: " + title, branchLine, ...extras, detail, "Allow this tool call?"]
      .filter((s) => Boolean(s && String(s).trim()))
      .join("\n\n");
    const choice = await vscode.window.showInformationMessage(body, { modal: true }, "Allow", "Skip");
    if (choice === "Allow") {
      return { behavior: "allow" as const };
    }
    return { behavior: "deny" as const, message: "User skipped this tool call." };
  });
}

async function refreshCommandCatalog(
  query: ClaudeAgentQuery,
  workspaceRoot: string,
  onCatalog?: (commands: ReturnType<typeof updateProviderCommandCatalogFromSdk>) => void,
): Promise<void> {
  if (typeof query.supportedCommands !== "function") {
    return;
  }
  try {
    const commands = await query.supportedCommands();
    if (!Array.isArray(commands)) {
      return;
    }
    const catalog = updateProviderCommandCatalogFromSdk(workspaceRoot, commands);
    onCatalog?.(catalog);
  } catch {
    /* discovery is best-effort; do not fail the turn */
  }
}

export class ClaudeAgentProvider implements AgentBackend {
  constructor(private readonly secrets: vscode.SecretStorage) {}

  async run(input: AgentBackendRunInput): Promise<AgentRunResult> {
    if (input.signal?.aborted) {
      return { text: "", stub: "explicit", cancelled: true };
    }
    const apiKey = (await this.secrets.get(SECRET_ANTHROPIC_API_KEY))?.trim();
    if (!apiKey) {
      throw new Error(
        'Colcoor: no Anthropic API key stored. Run "Colcoor: Set provider API key" to add one.',
      );
    }

    const sdk = await loadSdk();
    const cfg = vscode.workspace.getConfiguration("colcoor");
    const model = resolveRunModel(input.cliModel, resolveAgentModel(cfg));
    const cwd = input.workspaceRoot.trim() || process.cwd();
    const plan = input.agentSession ?? { kind: "fresh" };

    let resumeSessionId: string | undefined;
    if (plan.kind === "resume") {
      resumeSessionId = plan.sessionId;
    } else if (plan.kind === "fork") {
      if (!sdk.forkSession) {
        throw new Error("Colcoor: installed Claude Agent SDK does not support forkSession.");
      }
      const forked = await sdk.forkSession(plan.sessionId, {
        upToId: plan.upToMessageId,
        dir: cwd,
      });
      resumeSessionId = forked.sessionId;
    }

    const abortController = new AbortController();
    const onAbort = (): void => abortController.abort();
    if (input.signal) {
      if (input.signal.aborted) {
        return { text: "", stub: "explicit", cancelled: true };
      }
      input.signal.addEventListener("abort", onAbort, { once: true });
    }

    try {
      const query = sdk.query({
        prompt: promptForPlan(input, plan),
        options: {
          cwd,
          model,
          ...(resumeSessionId ? { resume: resumeSessionId } : {}),
          env: { ...process.env, ANTHROPIC_API_KEY: apiKey },
          executable: process.execPath,
          abortController,
          // Enable discovered skills so `/skill-name` and the Skill tool work.
          skills: "all",
          ...(input.disallowedTools?.length
            ? { disallowedTools: input.disallowedTools }
            : {}),
          canUseTool: (
            toolName: string,
            toolInput: Record<string, unknown>,
            toolOptions: {
              title?: string;
              blockedPath?: string;
              decisionReason?: string;
            },
          ) =>
            bridgeToolApproval(toolName, toolInput, toolOptions, input.toolApprovalBranchLabel),
        },
      });

      // Best-effort initial discovery (may resolve after initialize).
      void refreshCommandCatalog(query, cwd, input.onProviderCommandsChanged);

      let text = "";
      let sessionId: string | undefined = resumeSessionId;
      let lastMessageId: string | undefined;
      let sdkResult: SdkResultUsageCapture | undefined;
      for await (const message of query) {
        if (typeof message.session_id === "string" && message.session_id.trim()) {
          sessionId = message.session_id.trim();
        }
        if (typeof message.uuid === "string" && message.uuid.trim()) {
          lastMessageId = message.uuid.trim();
        }
        if (
          message.type === "system" &&
          message.subtype === "commands_changed" &&
          Array.isArray(message.commands)
        ) {
          const catalog = updateProviderCommandCatalogFromSdk(cwd, message.commands);
          input.onProviderCommandsChanged?.(catalog);
        }
        if (message.type === "assistant") {
          const blocks = message.message?.content ?? [];
          const delta = blocks
            .filter((b) => b.type === "text" && typeof b.text === "string")
            .map((b) => b.text as string)
            .join("");
          if (delta) {
            text += delta;
            input.onTextDelta?.(text);
          }
        } else if (message.type === "result") {
          sdkResult = message;
          if (typeof message.result === "string" && message.result.trim() && !text.trim()) {
            text = message.result;
            input.onTextDelta?.(text);
          }
        }
      }

      // Refresh once more after the turn in case initialize completed mid-stream.
      await refreshCommandCatalog(query, cwd, input.onProviderCommandsChanged);

      const usageOpts = {
        mode: normalizeProviderMode(input.cliMode),
        model,
        continuation: agentSessionToContinuation(plan),
      };
      const providerUsage = sdkResult
        ? providerUsageFromSdkResult(sdkResult, {
            ...usageOpts,
            cancelled: input.signal?.aborted === true,
          })
        : undefined;

      if (input.signal?.aborted) {
        return {
          text: normalizePersistedUserInputText(text),
          stub: "none",
          cancelled: true,
          providerSessionId: sessionId,
          providerMessageId: lastMessageId,
          providerUsage,
        };
      }
      const resolved = normalizePersistedUserInputText(text);
      if (!resolved) {
        throw new Error("Claude Agent SDK returned an empty response.");
      }
      return {
        text: resolved,
        stub: "none",
        cliModelId: model,
        providerSessionId: sessionId,
        providerMessageId: lastMessageId,
        providerUsage,
      };
    } catch (e) {
      if (isAbortError(e) || input.signal?.aborted) {
        return { text: "", stub: "explicit", cancelled: true };
      }
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`Colcoor (Claude Agent SDK): ${msg}`);
    } finally {
      input.signal?.removeEventListener("abort", onAbort);
    }
  }
}

function isAbortError(e: unknown): boolean {
  if (e instanceof DOMException && e.name === "AbortError") {
    return true;
  }
  return Boolean(e && typeof e === "object" && (e as { name?: string }).name === "AbortError");
}
