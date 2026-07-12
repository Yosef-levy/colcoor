import * as vscode from "vscode";

import { normalizePersistedUserInputText } from "../../conversation/normalizeUserInputText";
import { enqueueToolCallApproval } from "../cursorToolCallApprovalQueue";
import { SECRET_ANTHROPIC_API_KEY } from "../providerApiKey";
import {
  agentSessionToContinuation,
  normalizeProviderMode,
  providerUsageFromSdkResult,
  type SdkResultUsageCapture,
} from "../../conversation/messageProviderUsage";
import { resolveAgentModel } from "./anthropicConfig";
import type { AgentBackend, AgentBackendRunInput, AgentRunResult, AgentSessionPlan } from "./types";

/** Minimal surface of `@anthropic-ai/claude-agent-sdk` that Colcoor depends on. */
type ClaudeAgentSdk = {
  query: (args: { prompt: string; options?: Record<string, unknown> }) => AsyncIterable<SdkMessage>;
  forkSession?: (
    sessionId: string,
    options?: { upToId?: string; dir?: string },
  ) => Promise<{ sessionId: string }>;
};

type SdkMessage = SdkResultUsageCapture & {
  type?: string;
  subtype?: string;
  uuid?: string;
  session_id?: string;
  result?: string;
  message?: { content?: Array<{ type?: string; text?: string }> };
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

/** The prompt to send: full transcript for a fresh session, otherwise just the new user message. */
function promptForPlan(input: AgentBackendRunInput, plan: AgentSessionPlan): string {
  const appendix = input.workspaceContextAppendix ?? "";
  if (plan.kind === "fresh") {
    return appendix ? `${input.transcriptText}${appendix}` : input.transcriptText;
  }
  const base = input.userMessage.trim() || input.transcriptText;
  return appendix ? `${base}${appendix}` : base;
}

async function bridgeToolApproval(
  toolName: string,
  branchLabel: string | undefined,
): Promise<{ behavior: "allow" } | { behavior: "deny"; message: string }> {
  return enqueueToolCallApproval(async () => {
    const branchPrefix = branchLabel?.trim() ? `Reply branch: ${branchLabel.trim()}\n\n` : "";
    const choice = await vscode.window.showInformationMessage(
      `Colcoor: the agent wants to use the "${toolName}" tool.\n\n${branchPrefix}Allow this tool call?`,
      { modal: true },
      "Allow",
      "Skip",
    );
    if (choice === "Allow") {
      return { behavior: "allow" as const };
    }
    return { behavior: "deny" as const, message: "User skipped this tool call." };
  });
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
    const model = resolveAgentModel(cfg);
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
      const iterator = sdk.query({
        prompt: promptForPlan(input, plan),
        options: {
          cwd,
          model,
          ...(resumeSessionId ? { resume: resumeSessionId } : {}),
          env: { ...process.env, ANTHROPIC_API_KEY: apiKey },
          executable: process.execPath,
          abortController,
          canUseTool: (toolName: string) =>
            bridgeToolApproval(toolName, input.toolApprovalBranchLabel),
        },
      });

      let text = "";
      let sessionId: string | undefined = resumeSessionId;
      let lastMessageId: string | undefined;
      let sdkResult: SdkResultUsageCapture | undefined;
      for await (const message of iterator) {
        if (typeof message.session_id === "string" && message.session_id.trim()) {
          sessionId = message.session_id.trim();
        }
        if (typeof message.uuid === "string" && message.uuid.trim()) {
          lastMessageId = message.uuid.trim();
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
