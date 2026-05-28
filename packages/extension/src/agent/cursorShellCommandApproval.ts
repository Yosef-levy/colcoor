import { spawn } from "node:child_process";

import * as vscode from "vscode";

import { appendCliShellAllow } from "./cursorCliConfigPermissions";
import {
  continuationPromptAfterAllowlist,
  continuationPromptAfterRun,
  continuationPromptAfterSkip,
  shellCommandBaseForAllowlist,
  type ShellToolCallRejection,
} from "./cursorShellToolCall";

export type ShellApprovalDecision = "run" | "skip" | "allowlist";

export type ShellRejectionResolution = {
  kind: "resume";
  continuationPrompt: string;
};

const RUN_LABEL = "Run";
const ALLOWLIST_LABEL = "Add to allowlist";
const SKIP_LABEL = "Skip";

/** Ask the user how to handle a Cursor CLI shell rejection (Run / Skip / Add to allowlist). */
export async function promptShellApproval(rejection: ShellToolCallRejection): Promise<ShellApprovalDecision> {
  const title = rejection.description?.trim() || "Shell command needs approval";
  const detail = rejection.workingDirectory
    ? `${rejection.command}\n\nWorking directory:\n${rejection.workingDirectory}`
    : rejection.command;
  const choice = await vscode.window.showInformationMessage(
    `Colcoor: ${title}\n\n${detail}`,
    { modal: true },
    RUN_LABEL,
    ALLOWLIST_LABEL,
    SKIP_LABEL,
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

/** Resolve a CLI shell rejection: prompt, optionally allowlist or run locally, return resume prompt. */
export async function resolveShellToolCallRejection(
  rejection: ShellToolCallRejection,
  timeoutMs: number,
): Promise<ShellRejectionResolution> {
  const decision = await promptShellApproval(rejection);
  if (decision === "skip") {
    return { kind: "resume", continuationPrompt: continuationPromptAfterSkip(rejection) };
  }
  if (decision === "allowlist") {
    const base = shellCommandBaseForAllowlist(rejection.command, rejection.simpleCommands);
    if (base) {
      await appendCliShellAllow(base);
    }
    return { kind: "resume", continuationPrompt: continuationPromptAfterAllowlist(rejection) };
  }
  const exec = await executeShellCommandOnce({
    command: rejection.command,
    workingDirectory: rejection.workingDirectory,
    timeoutMs,
  });
  return { kind: "resume", continuationPrompt: continuationPromptAfterRun(rejection, exec) };
}
