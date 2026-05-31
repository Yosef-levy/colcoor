import { spawn } from "node:child_process";

import * as vscode from "vscode";

import { appendCliPermissionTokens } from "./cursorCliConfigPermissions";
import { enqueueToolCallApproval } from "./cursorToolCallApprovalQueue";
import {
  continuationPromptAfterAllowlist,
  continuationPromptAfterRun,
  continuationPromptAfterSkip,
  continuationPromptAfterWebShellFallback,
  enrichRejectionWithUserRequest,
  runOnceLabelForRejection,
  toolCallSupportsRunOnce,
  toolCallSupportsShellInstead,
  type ToolCallRejection,
} from "./cursorToolCallRejection";

export type ToolApprovalDecision = "run" | "skip" | "allowlist" | "useShell";

export type ToolCallApprovalPromptContext = {
  /** Short label for the Colcoor branch that triggered this approval (shown in the modal). */
  branchLabel?: string;
};

export type ToolRejectionResolution = {
  kind: "resume";
  continuationPrompt: string;
};

const ALLOWLIST_LABEL = "Add to allowlist";
const SKIP_LABEL = "Skip";
const USE_SHELL_LABEL = "Use shell instead";

/** Ask the user how to handle a Cursor CLI tool rejection. */
export async function promptToolCallApproval(
  rejection: ToolCallRejection,
  context?: ToolCallApprovalPromptContext,
): Promise<ToolApprovalDecision> {
  return enqueueToolCallApproval(async () => {
    const title = rejection.title.trim() || "Tool call needs approval";
    const canRun = toolCallSupportsRunOnce(rejection);
    const canUseShell = toolCallSupportsShellInstead(rejection);
    const showAllowlist = !rejection.headlessWebBlock && rejection.allowTokens.length > 0;

    const choices: string[] = [];
    if (canRun) {
      choices.push(runOnceLabelForRejection(rejection));
    }
    if (canUseShell) {
      choices.push(USE_SHELL_LABEL);
    }
    if (showAllowlist) {
      choices.push(ALLOWLIST_LABEL);
    }
    choices.push(SKIP_LABEL);

    const branchLabel = context?.branchLabel?.trim();
    const branchPrefix = branchLabel ? `Reply branch: ${branchLabel}\n\n` : "";

    const detail = rejection.headlessWebBlock
      ? [
          rejection.userRequest ? `User asked: ${rejection.userRequest}` : rejection.detail,
          rejection.shellFallbackCommand
            ? `Suggested: ${rejection.shellFallbackCommand}`
            : undefined,
          "Native web tools are blocked in Cursor headless CLI; allowlist tokens do not re-enable them.",
        ]
          .filter(Boolean)
          .join("\n\n")
      : rejection.detail;

    const choice = await vscode.window.showInformationMessage(
      `Colcoor: ${title}\n\n${branchPrefix}${detail}`,
      { modal: true },
      ...choices,
    );
    if (canRun && choice === runOnceLabelForRejection(rejection)) {
      return "run";
    }
    if (canUseShell && choice === USE_SHELL_LABEL) {
      return "useShell";
    }
    if (showAllowlist && choice === ALLOWLIST_LABEL) {
      return "allowlist";
    }
    return "skip";
  });
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
  userMessage?: string,
  context?: ToolCallApprovalPromptContext,
): Promise<ToolRejectionResolution> {
  const enriched = enrichRejectionWithUserRequest(rejection, userMessage);
  const decision = await promptToolCallApproval(enriched, context);
  if (decision === "skip") {
    return { kind: "resume", continuationPrompt: continuationPromptAfterSkip(enriched) };
  }
  if (decision === "useShell") {
    return { kind: "resume", continuationPrompt: continuationPromptAfterWebShellFallback(enriched) };
  }
  if (decision === "allowlist") {
    if (enriched.allowTokens.length === 0) {
      throw new Error(
        "Colcoor: cannot add this tool to the Cursor CLI allowlist automatically. Edit ~/.cursor/cli-config.json manually.",
      );
    }
    await appendCliPermissionTokens(enriched.allowTokens);
    return { kind: "resume", continuationPrompt: continuationPromptAfterAllowlist(enriched) };
  }
  const command = enriched.shellFallbackCommand ?? enriched.shell?.command;
  if (!command) {
    return { kind: "resume", continuationPrompt: continuationPromptAfterSkip(enriched) };
  }
  if (enriched.shellFallbackCommand) {
    await appendCliPermissionTokens(["Shell(curl)"]);
  }
  const exec = await executeShellCommandOnce({
    command,
    workingDirectory: enriched.shell?.workingDirectory,
    timeoutMs,
  });
  return { kind: "resume", continuationPrompt: continuationPromptAfterRun(enriched, exec) };
}
