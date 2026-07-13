import Anthropic from "@anthropic-ai/sdk";
import * as vscode from "vscode";

import { normalizePersistedUserInputText } from "../../conversation/normalizeUserInputText";
import {
  normalizeProviderMode,
  providerUsageFromAnthropicMessage,
  sumAnthropicUsageTokens,
} from "../../conversation/messageProviderUsage";
import { SECRET_ANTHROPIC_API_KEY } from "../providerApiKey";
import {
  resolveAskModel,
  resolvePromptCacheTtl,
  resolveRunModel,
  type PromptCacheTtl,
} from "./anthropicConfig";
import type { AgentBackend, AgentBackendRunInput, AgentRunResult, LlmMessage } from "./types";
import { executeWorkspaceReadFile } from "./workspaceReadFileTool";

const DEFAULT_MAX_TOKENS = 8192;
const MAX_TOOL_ROUNDS = 8;

const ASK_SYSTEM_ADDENDUM = `You may call tools when helpful: read_file (workspace files), web_search, and web_fetch. Prefer tools over guessing file contents or live web facts.`;

const READ_FILE_TOOL: Anthropic.Tool = {
  name: "read_file",
  description:
    "Read a text file from the user's workspace. Path may be absolute under the workspace root or relative to it.",
  input_schema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Absolute or workspace-relative path to the file",
      },
    },
    required: ["path"],
  },
};

const ASK_TOOLS: Anthropic.ToolUnion[] = [
  { type: "web_search_20250305", name: "web_search" },
  { type: "web_fetch_20250910", name: "web_fetch" },
  READ_FILE_TOOL,
];

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

function textBlocksFromContent(content: Anthropic.ContentBlock[]): string {
  return content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}

function userContentBlocks(
  m: LlmMessage,
  cacheControl?: Anthropic.CacheControlEphemeral,
): string | Anthropic.ContentBlockParam[] {
  const hasImages = Boolean(m.images?.length);
  if (!hasImages && !cacheControl) {
    return m.content;
  }
  const blocks: Anthropic.ContentBlockParam[] = [
    {
      type: "text",
      text: m.content,
      ...(cacheControl ? { cache_control: cacheControl } : {}),
    },
  ];
  for (const img of m.images ?? []) {
    blocks.push({
      type: "image",
      source: {
        type: "base64",
        media_type: img.mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
        data: img.dataBase64,
      },
    });
  }
  return blocks;
}

export function toApiMessages(
  messages: LlmMessage[],
  ttl: PromptCacheTtl,
  opts?: { applyCacheBreakpoint?: boolean },
): Anthropic.MessageParam[] {
  const applyCache = opts?.applyCacheBreakpoint !== false;
  const breakpoint = applyCache ? cacheBreakpointIndex(messages.length) : undefined;
  return messages.map((m, i) => {
    const cacheControl =
      i === breakpoint ? ({ type: "ephemeral" as const, ttl } satisfies Anthropic.CacheControlEphemeral) : undefined;
    if (m.role === "assistant") {
      if (cacheControl) {
        return {
          role: "assistant" as const,
          content: [
            {
              type: "text" as const,
              text: m.content,
              cache_control: cacheControl,
            },
          ],
        };
      }
      return { role: "assistant" as const, content: m.content };
    }
    return {
      role: "user" as const,
      content: userContentBlocks(m, cacheControl),
    };
  });
}

function contentBlocksToParams(content: Anthropic.ContentBlock[]): Anthropic.ContentBlockParam[] {
  return content.map((block): Anthropic.ContentBlockParam => {
    switch (block.type) {
      case "text":
        return { type: "text", text: block.text };
      case "tool_use":
        return {
          type: "tool_use",
          id: block.id,
          name: block.name,
          input: block.input as Record<string, unknown>,
        };
      case "server_tool_use":
        return {
          type: "server_tool_use",
          id: block.id,
          name: block.name,
          input: block.input as Record<string, unknown>,
        };
      case "thinking":
        return {
          type: "thinking",
          thinking: block.thinking,
          signature: block.signature,
        };
      case "redacted_thinking":
        return { type: "redacted_thinking", data: block.data };
      case "web_search_tool_result":
        return {
          type: "web_search_tool_result",
          tool_use_id: block.tool_use_id,
          content: block.content as Anthropic.WebSearchToolResultBlockParam["content"],
        };
      case "web_fetch_tool_result":
        return {
          type: "web_fetch_tool_result",
          tool_use_id: block.tool_use_id,
          content: block.content as Anthropic.WebFetchToolResultBlockParam["content"],
        };
      default:
        // Preserve unknown / other server result shapes by casting; Anthropic accepts them on continue.
        return block as unknown as Anthropic.ContentBlockParam;
    }
  });
}

function readFilePathFromInput(input: unknown): string {
  if (!input || typeof input !== "object") {
    return "";
  }
  const path = (input as Record<string, unknown>).path;
  return typeof path === "string" ? path : "";
}

async function runClientTools(
  workspaceRoot: string,
  toolUses: Anthropic.ToolUseBlock[],
): Promise<Anthropic.ToolResultBlockParam[]> {
  const results: Anthropic.ToolResultBlockParam[] = [];
  for (const tu of toolUses) {
    if (tu.name !== "read_file") {
      results.push({
        type: "tool_result",
        tool_use_id: tu.id,
        content: `unsupported tool: ${tu.name}`,
        is_error: true,
      });
      continue;
    }
    const result = await executeWorkspaceReadFile(workspaceRoot, readFilePathFromInput(tu.input));
    results.push({
      type: "tool_result",
      tool_use_id: tu.id,
      content: result.content,
      ...(result.isError ? { is_error: true } : {}),
    });
  }
  return results;
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
    const model = resolveRunModel(input.cliModel, resolveAskModel(cfg));
    const ttl = resolvePromptCacheTtl(cfg);

    const client = new Anthropic({ apiKey });
    const system: Anthropic.TextBlockParam[] = [
      {
        type: "text",
        text: request.system,
        cache_control: { type: "ephemeral", ttl },
      },
      {
        type: "text",
        text: ASK_SYSTEM_ADDENDUM,
      },
    ];

    const messages: Anthropic.MessageParam[] = toApiMessages(request.messages, ttl, {
      applyCacheBreakpoint: true,
    });

    const startedAt = Date.now();
    const usages: Anthropic.Usage[] = [];
    let streamedText = "";
    let lastMessage: Anthropic.Message | undefined;
    let rounds = 0;

    try {
      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        rounds = round + 1;
        if (input.signal?.aborted) {
          return {
            text: normalizePersistedUserInputText(streamedText),
            stub: streamedText ? "none" : "explicit",
            cancelled: true,
            cliModelId: lastMessage?.model || model,
            providerUsage: lastMessage
              ? providerUsageFromAnthropicMessage(lastMessage, {
                  mode: normalizeProviderMode(input.cliMode),
                  promptCacheTtl: ttl,
                  cancelled: true,
                  durationMs: Date.now() - startedAt,
                  tokens: usages.length ? sumAnthropicUsageTokens(usages) : undefined,
                  numTurns: rounds,
                })
              : undefined,
          };
        }

        const stream = client.messages.stream(
          {
            model,
            max_tokens: DEFAULT_MAX_TOKENS,
            system,
            messages,
            tools: ASK_TOOLS,
          },
          { signal: input.signal },
        );

        const roundBase = streamedText;
        let roundText = "";
        stream.on("text", (delta: string) => {
          roundText += delta;
          streamedText = roundBase + roundText;
          input.onTextDelta?.(streamedText);
        });

        const finalMessage = await stream.finalMessage();
        lastMessage = finalMessage;
        usages.push(finalMessage.usage);

        const stop = finalMessage.stop_reason;
        if (stop === "pause_turn") {
          messages.push({
            role: "assistant",
            content: contentBlocksToParams(finalMessage.content),
          });
          continue;
        }

        if (stop === "tool_use") {
          const toolUses = finalMessage.content.filter(
            (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
          );
          messages.push({
            role: "assistant",
            content: contentBlocksToParams(finalMessage.content),
          });
          const toolResults = await runClientTools(input.workspaceRoot, toolUses);
          messages.push({ role: "user", content: toolResults });
          continue;
        }

        // end_turn | max_tokens | stop_sequence | refusal | etc.
        const finalText = textBlocksFromContent(finalMessage.content);
        const resolved = normalizePersistedUserInputText(finalText || streamedText);
        if (!resolved) {
          throw new Error("Anthropic returned an empty response.");
        }
        const providerUsage = providerUsageFromAnthropicMessage(finalMessage, {
          mode: normalizeProviderMode(input.cliMode),
          promptCacheTtl: ttl,
          durationMs: Date.now() - startedAt,
          tokens: sumAnthropicUsageTokens(usages),
          numTurns: rounds,
        });
        return {
          text: resolved,
          stub: "none",
          cliModelId: finalMessage.model || model,
          providerUsage,
        };
      }

      throw new Error(`Anthropic ask tool loop exceeded ${MAX_TOOL_ROUNDS} rounds.`);
    } catch (e) {
      if (isAbortError(e) || input.signal?.aborted) {
        return {
          text: normalizePersistedUserInputText(streamedText),
          stub: streamedText ? "none" : "explicit",
          cancelled: true,
          cliModelId: lastMessage?.model || model,
          providerUsage: lastMessage
            ? providerUsageFromAnthropicMessage(lastMessage, {
                mode: normalizeProviderMode(input.cliMode),
                promptCacheTtl: ttl,
                cancelled: true,
                durationMs: Date.now() - startedAt,
                tokens: usages.length ? sumAnthropicUsageTokens(usages) : undefined,
                numTurns: rounds || undefined,
              })
            : undefined,
        };
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
