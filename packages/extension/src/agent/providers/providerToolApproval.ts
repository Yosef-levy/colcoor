import * as vscode from "vscode";
import type {
  RequestPermissionRequest,
  RequestPermissionResponse,
  ToolKind,
} from "@agentclientprotocol/sdk";

import { enqueueToolCallApproval } from "../cursorToolCallApprovalQueue";

export function formatToolInputDetail(input: Record<string, unknown>): string {
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
    const value = input[key];
    if (typeof value === "string" && value.trim()) {
      lines.push(`${key}: ${value.trim().slice(0, 400)}`);
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
      if (raw && raw !== "{}") lines.push(raw.length > 500 ? `${raw.slice(0, 500)}…` : raw);
    } catch {
      // Ignore unserializable provider input.
    }
  }
  return lines.join("\n");
}

export async function bridgeClaudeToolApproval(
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
      .filter((value) => Boolean(value && String(value).trim()))
      .join("\n\n");
    const choice = await vscode.window.showInformationMessage(body, { modal: true }, "Allow", "Skip");
    return choice === "Allow"
      ? { behavior: "allow" as const }
      : { behavior: "deny" as const, message: "User skipped this tool call." };
  });
}

const ACP_TOOL_KINDS = new Set<ToolKind>([
  "read",
  "edit",
  "delete",
  "move",
  "search",
  "execute",
  "think",
  "fetch",
  "switch_mode",
  "other",
]);

function acpToolDetail(request: RequestPermissionRequest): string {
  const chunks: string[] = [];
  for (const item of request.toolCall.content ?? []) {
    if (item.type === "diff") {
      chunks.push(
        `Path: ${item.path}\n--- before\n${item.oldText ?? ""}\n+++ after\n${item.newText ?? ""}`,
      );
    } else if (item.type === "content" && item.content.type === "text") {
      chunks.push(item.content.text);
    } else if (item.type === "terminal") {
      chunks.push(`Terminal: ${item.terminalId}`);
    }
  }
  for (const location of request.toolCall.locations ?? []) {
    chunks.push(`Location: ${location.path}${location.line != null ? `:${location.line}` : ""}`);
  }
  return chunks.join("\n\n").slice(0, 12_000);
}

/** Fail-closed bridge for ACP `session/request_permission`. */
export async function bridgeAcpToolApproval(
  request: RequestPermissionRequest,
  branchLabel: string | undefined,
  allowPersistentOptions: boolean,
  signal?: AbortSignal,
): Promise<RequestPermissionResponse> {
  if (
    signal?.aborted ||
    !request.toolCall.kind ||
    !ACP_TOOL_KINDS.has(request.toolCall.kind) ||
    request.options.length === 0
  ) {
    return { outcome: { outcome: "cancelled" } };
  }
  const options = request.options.filter(
    (option) => allowPersistentOptions || option.kind !== "allow_always",
  );
  if (options.length === 0) return { outcome: { outcome: "cancelled" } };

  return enqueueToolCallApproval(async () => {
    if (signal?.aborted) return { outcome: { outcome: "cancelled" } };
    const branchLine = branchLabel?.trim() ? `Reply branch: ${branchLabel.trim()}` : "";
    const body = [
      `Colcoor: ${request.toolCall.title || "Gemini wants to use a tool"}`,
      branchLine,
      `Kind: ${request.toolCall.kind}`,
      acpToolDetail(request),
      "Choose exactly how Colcoor should answer Gemini CLI.",
    ]
      .filter(Boolean)
      .join("\n\n");
    const labels = options.map((option) => option.name);
    const selected = await vscode.window.showInformationMessage(body, { modal: true }, ...labels);
    if (signal?.aborted || !selected) return { outcome: { outcome: "cancelled" } };
    const option = options.find((candidate) => candidate.name === selected);
    return option
      ? { outcome: { outcome: "selected", optionId: option.optionId } }
      : { outcome: { outcome: "cancelled" } };
  });
}
