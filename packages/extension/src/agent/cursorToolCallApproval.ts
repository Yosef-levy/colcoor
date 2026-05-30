import { spawn } from "node:child_process";

import * as vscode from "vscode";

import { appendCliPermissionTokens } from "./cursorCliConfigPermissions";
import {
  continuationPromptAfterAllowlist,
  continuationPromptAfterRun,
  continuationPromptAfterSkip,
  toolCallSupportsRunOnce,
  type ToolCallRejection,
} from "./cursorToolCallRejection";

export type ToolApprovalDecision = "run" | "skip" | "allowlist";

export type ToolRejectionResolution = {
  kind: "resume";
  continuationPrompt: string;
};

const RUN_LABEL = "Run";
const ALLOWLIST_LABEL = "Add to allowlist";
const SKIP_LABEL = "Skip";

/** Ask the user how to handle a Cursor CLI tool rejection. Shell offers Run; other tools are Skip / Allowlist. */
export async function promptToolCallApproval(
  rejection: ToolCallRejection,
): Promise<ToolApprovalDecision> {
  const title = rejection.title.trim() || "Tool call needs approval";
  const canRun = toolCallSupportsRunOnce(rejection);
  const choices = canRun ? [RUN_LABEL, ALLOWLIST_LABEL, SKIP_LABEL] : [ALLOWLIST_LABEL, SKIP_LABEL];
  const choice = await vscode.window.showInformationMessage(
    `Colcoor: ${title}\n\n${rejection.detail}`,
    { modal: true },
    ...choices,
  );
  if (choice === RUN_LABEL) {
    return "run";
  }
  if (choice === ALLOWLIST_LABEL) {
    return "allowlist";
  }
  return "skip";
}

export async function executeShellCommandOnce(params: {
  command: string;
  workingDirectory?: string;
  timeoutMs?: number;
}): Promise<{ exitCode: number | null; stdout: string; stderr: string }> {
  const cwd = params.workingDirectory?.trim() || process.cwd();
  const timeoutMs = Math.max(10_000, params.timeoutMs ?? 600_000);
  const shell = process.platform === "win32"
    ? { file: "cmd.exe", args: ["/d", "/s", "/c", params.command] as string[] }
    : { file: "bash", args: ["-lc", params.command] as string[] };

  return new Promise((resolve, reject) => {
    const child = spawn(shell.file, shell.args, {
      cwd,
      env: process.env,
      shell: false,
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      child.kill("SIGTERM");
      reject(new Error(`Colcoor: approved shell command timed out after ${timeoutMs}ms.`));
    }, timeoutMs);

    child.stdout?.on("data", (chunk: Buffer | string) => {
      stdout += typeof chunk === "string" ? chunk : chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk: Buffer | string) => {
      stderr += typeof chunk === "string" ? chunk : chunk.toString("utf8");
    });
    child.on("error", (err) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (exitCode) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve({ exitCode, stdout, stderr });
    });
  });
}

/** Resolve a CLI tool rejection: prompt, optionally allowlist or run shell locally, return resume prompt. */
export async function resolveToolCallRejection(
  rejection: ToolCallRejection,
  timeoutMs: number,
): Promise<ToolRejectionResolution> {
  const decision = await promptToolCallApproval(rejection);
  if (decision === "skip") {
    return { kind: "resume", continuationPrompt: continuationPromptAfterSkip(rejection) };
  }
  if (decision === "allowlist") {
    if (rejection.allowTokens.length === 0) {
      throw new Error(
        "Colcoor: cannot add this tool to the Cursor CLI allowlist automatically. Edit ~/.cursor/cli-config.json manually.",
      );
    }
    await appendCliPermissionTokens(rejection.allowTokens);
    return { kind: "resume", continuationPrompt: continuationPromptAfterAllowlist(rejection) };
  }
  const shell = rejection.shell;
  if (!shell?.command) {
    return { kind: "resume", continuationPrompt: continuationPromptAfterSkip(rejection) };
  }
  const exec = await executeShellCommandOnce({
    command: shell.command,
    workingDirectory: shell.workingDirectory,
    timeoutMs,
  });
  return { kind: "resume", continuationPrompt: continuationPromptAfterRun(rejection, exec) };
}
