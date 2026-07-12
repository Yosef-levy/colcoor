import Anthropic from "@anthropic-ai/sdk";
import * as vscode from "vscode";

import { normalizePersistedUserInputText } from "../../conversation/normalizeUserInputText";
import { SECRET_ANTHROPIC_API_KEY } from "../providerApiKey";
import {
  resolveAskModel,
  resolvePromptCacheTtl,
  type PromptCacheTtl,
} from "./anthropicConfig";
import {
  normalizeProviderMode,
  providerUsageFromAnthropicMessage,
} from "../../conversation/messageProviderUsage";
import type { AgentBackend, AgentBackendRunInput, AgentRunResult, LlmMessage } from "./types";

const DEFAULT_MAX_TOKENS = 8192;

/**
 * Index of the last message that belongs to the byte-stable shared prefix. Caching this message (and
 * the system prompt) lets sibling branches reuse the same cache entry; only the trailing new user
 * turn stays uncached.
 */
export function cacheBreakpointIndex(messageCount: number): number | undefined {
  if (messageCount <= 0) {
    return undefined;
  }
  return messageCount >= 2 ? messageCount - 2 : messageCount - 1;
}

function toApiMessages(
  messages: LlmMessage[],
  ttl: PromptCacheTtl,
): Anthropic.MessageParam[] {
  const breakpoint = cacheBreakpointIndex(messages.length);
  return messages.map((m, i) => {
    if (i === breakpoint) {
      return {
        role: m.role,
        content: [
          {
            type: "text" as const,
            text: m.content,
            cache_control: { type: "ephemeral" as const, ttl },
          },
        ],
      };
    }
    return { role: m.role, content: m.content };
  });
}

export class AnthropicLlmProvider implements AgentBackend {
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
    const request = input.llmRequest;
    if (!request || request.messages.length === 0) {
      throw new Error("Colcoor: ask mode has no messages to send.");
    }

    const cfg = vscode.workspace.getConfiguration("colcoor");
    const model = resolveAskModel(cfg);
    const ttl = resolvePromptCacheTtl(cfg);

    const client = new Anthropic({ apiKey });
    const system: Anthropic.TextBlockParam[] = [
      {
        type: "text",
        text: request.system,
        cache_control: { type: "ephemeral", ttl },
      },
    ];

    const startedAt = Date.now();
    try {
      const stream = client.messages.stream(
        {
          model,
          max_tokens: DEFAULT_MAX_TOKENS,
          system,
          messages: toApiMessages(request.messages, ttl),
        },
        { signal: input.signal },
      );

      let text = "";
      stream.on("text", (delta) => {
        text += delta;
        input.onTextDelta?.(text);
      });
      const finalMessage = await stream.finalMessage();
      const finalText = finalMessage.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");
      const resolved = normalizePersistedUserInputText(finalText || text);
      if (!resolved) {
        throw new Error("Anthropic returned an empty response.");
      }
      const providerUsage = providerUsageFromAnthropicMessage(finalMessage, {
        mode: normalizeProviderMode(input.cliMode),
        promptCacheTtl: ttl,
        durationMs: Date.now() - startedAt,
      });
      return {
        text: resolved,
        stub: "none",
        cliModelId: finalMessage.model || model,
        providerUsage,
      };
    } catch (e) {
      if (isAbortError(e) || input.signal?.aborted) {
        return { text: normalizePersistedUserInputText(""), stub: "explicit", cancelled: true };
      }
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`Colcoor (Anthropic Messages API): ${msg}`);
    }
  }
}

function isAbortError(e: unknown): boolean {
  if (e instanceof DOMException && e.name === "AbortError") {
    return true;
  }
  return Boolean(e && typeof e === "object" && (e as { name?: string }).name === "AbortError");
}
