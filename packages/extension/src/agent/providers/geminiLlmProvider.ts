import {
  GoogleGenAI,
  Type,
  type Content,
  type FunctionCall,
  type Part,
  type Tool,
  type UsageMetadata,
} from "@google/genai";
import * as vscode from "vscode";

import { normalizePersistedUserInputText } from "../../conversation/normalizeUserInputText";
import {
  normalizeProviderMode,
  providerUsageFromGemini,
} from "../../conversation/messageProviderUsage";
import { SECRET_GEMINI_API_KEY } from "../providerApiKey";
import { resolveRunModel } from "./anthropicConfig";
import { resolveGeminiAskModel } from "./geminiConfig";
import type { AgentBackend, AgentBackendRunInput, AgentRunResult, LlmMessage } from "./types";
import { executeWorkspaceListFiles } from "./workspaceListFilesTool";
import { executeWorkspaceReadFile } from "./workspaceReadFileTool";

const DEFAULT_MAX_TOKENS = 8192;
const MAX_TOOL_ROUNDS = 8;
const ASK_SYSTEM_ADDENDUM =
  "You may call list_files and read_file for read-only workspace access, plus Google Search and URL context. Use list_files before guessing workspace paths.";

function messageParts(message: LlmMessage): Part[] {
  const parts: Part[] = [{ text: message.content }];
  for (const image of message.images ?? []) {
    parts.push({ inlineData: { mimeType: image.mimeType, data: image.dataBase64 } });
  }
  return parts;
}

export function toGeminiContents(messages: LlmMessage[]): Content[] {
  return messages.map((message) => ({
    role: message.role === "assistant" ? "model" : "user",
    parts: messageParts(message),
  }));
}

const tools: Tool[] = [
  { googleSearch: {} },
  { urlContext: {} },
  {
    functionDeclarations: [
      {
        name: "read_file",
        description: "Read a text file under the current workspace.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            path: { type: Type.STRING, description: "Workspace-relative or absolute path" },
          },
          required: ["path"],
        },
      },
      {
        name: "list_files",
        description: "List a bounded tree under a workspace directory.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            path: { type: Type.STRING, description: "Workspace-relative directory" },
            depth: { type: Type.NUMBER, description: "Depth from 0 to 4" },
            max_entries: { type: Type.NUMBER, description: "Entry cap from 1 to 1000" },
          },
        },
      },
    ],
  },
];

function stringArg(call: FunctionCall, name: string): string {
  const value = call.args?.[name];
  return typeof value === "string" ? value : "";
}

function numberArg(call: FunctionCall, name: string): number | undefined {
  const value = call.args?.[name];
  return typeof value === "number" ? value : undefined;
}

async function runFunctionCall(workspaceRoot: string, call: FunctionCall): Promise<Part> {
  let content: string;
  let isError = false;
  if (call.name === "read_file") {
    const result = await executeWorkspaceReadFile(workspaceRoot, stringArg(call, "path"));
    content = result.content;
    isError = result.isError;
  } else if (call.name === "list_files") {
    const result = await executeWorkspaceListFiles(
      workspaceRoot,
      stringArg(call, "path") || ".",
      { depth: numberArg(call, "depth"), maxEntries: numberArg(call, "max_entries") },
    );
    content = result.content;
    isError = result.isError;
  } else {
    content = `unsupported tool: ${call.name ?? "(unnamed)"}`;
    isError = true;
  }
  return {
    functionResponse: {
      ...(call.id ? { id: call.id } : {}),
      name: call.name ?? "unknown",
      response: { content, is_error: isError },
    },
  };
}

export class GeminiLlmProvider implements AgentBackend {
  constructor(private readonly secrets: vscode.SecretStorage) {}

  async run(input: AgentBackendRunInput): Promise<AgentRunResult> {
    if (input.signal?.aborted) {
      return { text: "", stub: "explicit", cancelled: true, providerId: "gemini" };
    }
    const apiKey = (await this.secrets.get(SECRET_GEMINI_API_KEY))?.trim();
    if (!apiKey) {
      throw new Error(
        'Colcoor: no Gemini API key stored. Run "Colcoor: Set provider API key" to add one.',
      );
    }
    if (!input.llmRequest?.messages.length) {
      throw new Error("Colcoor: ask mode has no messages to send.");
    }

    const cfg = vscode.workspace.getConfiguration("colcoor");
    const model = resolveRunModel(input.cliModel, resolveGeminiAskModel(cfg));
    const ai = new GoogleGenAI({ apiKey });
    const contents = toGeminiContents(input.llmRequest.messages);
    const startedAt = Date.now();
    let text = "";
    let usage: UsageMetadata | undefined;
    let stopReason: string | null = null;
    let rounds = 0;

    try {
      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        rounds = round + 1;
        const responseParts: Part[] = [];
        const calls: FunctionCall[] = [];
        const stream = await ai.models.generateContentStream({
          model,
          contents,
          config: {
            systemInstruction: `${input.llmRequest.system}\n\n${ASK_SYSTEM_ADDENDUM}`,
            maxOutputTokens: DEFAULT_MAX_TOKENS,
            tools,
            abortSignal: input.signal,
          },
        });
        for await (const chunk of stream) {
          usage = chunk.usageMetadata ?? usage;
          const candidate = chunk.candidates?.[0];
          if (candidate?.finishReason) stopReason = String(candidate.finishReason);
          for (const part of candidate?.content?.parts ?? []) {
            responseParts.push(part);
            if (part.functionCall) calls.push(part.functionCall);
            if (part.text && !part.thought) {
              text += part.text;
              input.onTextDelta?.(text);
            }
          }
        }

        if (calls.length === 0) {
          const resolved = normalizePersistedUserInputText(text);
          if (!resolved) throw new Error("Gemini returned an empty response.");
          return {
            text: resolved,
            stub: "none",
            providerId: "gemini",
            cliModelId: model,
            providerUsage: providerUsageFromGemini(usage, {
              mode: normalizeProviderMode(input.cliMode),
              model,
              durationMs: Date.now() - startedAt,
              stopReason,
              numTurns: rounds,
            }),
          };
        }

        contents.push({ role: "model", parts: responseParts });
        contents.push({
          role: "user",
          parts: await Promise.all(calls.map((call) => runFunctionCall(input.workspaceRoot, call))),
        });
      }
      throw new Error(`Gemini ask tool loop exceeded ${MAX_TOOL_ROUNDS} rounds.`);
    } catch (error) {
      if (input.signal?.aborted || isAbortError(error)) {
        return {
          text: normalizePersistedUserInputText(text),
          stub: text ? "none" : "explicit",
          providerId: "gemini",
          cancelled: true,
          cliModelId: model,
          providerUsage: providerUsageFromGemini(usage, {
            mode: normalizeProviderMode(input.cliMode),
            model,
            durationMs: Date.now() - startedAt,
            stopReason,
            cancelled: true,
            numTurns: rounds || undefined,
          }),
        };
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Colcoor (Gemini API): ${message}`);
    }
  }
}

function isAbortError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      ((error as { name?: string }).name === "AbortError" ||
        (error as { code?: string }).code === "ABORT_ERR"),
  );
}
