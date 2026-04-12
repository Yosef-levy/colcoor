/**
 * First-run guidance for the Cursor headless CLI (`agent`).
 * Colcoor cannot bundle Cursor’s binary; we probe PATH and offer the official installer.
 */

import { spawn } from "node:child_process";
import * as vscode from "vscode";

import { processEnvForCursorCli } from "./agentPathEnv";

const DOCS_INSTALL = "https://cursor.com/docs/cli/installation";
const DOCS_HEADLESS = "https://cursor.com/docs/cli/headless";

/** Returns true if `agent -v` exits 0 within the timeout. */
export function probeAgentExecutable(executable: string, timeoutMs = 5000): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(executable, ["-v"], {
      shell: false,
      windowsHide: true,
      env: processEnvForCursorCli(),
    });
    const timer = setTimeout(() => {
      child.kill();
      resolve(false);
    }, timeoutMs);
    const done = (ok: boolean) => {
      clearTimeout(timer);
      resolve(ok);
    };
    child.on("error", () => done(false));
    child.on("close", (code) => done(code === 0));
  });
}

export function officialInstallShellLine(): string {
  if (process.platform === "win32") {
    return "irm 'https://cursor.com/install?win32=true' | iex";
  }
  return "curl https://cursor.com/install -fsS | bash";
}

export async function openCursorCliInstallDocs(): Promise<void> {
  await vscode.env.openExternal(vscode.Uri.parse(DOCS_INSTALL));
}

export async function runCursorCliInstallerInTerminal(): Promise<void> {
  const line = officialInstallShellLine();
  const ok = await vscode.window.showWarningMessage(
    "Colcoor will open a terminal and run Cursor’s **official** install script (from cursor.com). " +
      "Review the command before pressing Enter if you are unsure.",
    { modal: true },
    "Continue",
  );
  if (ok !== "Continue") {
    return;
  }
  const term = vscode.window.createTerminal({ name: "Install Cursor CLI" });
  term.show();
  term.sendText(line);
  await vscode.window.showInformationMessage(
    "Colcoor: when the installer finishes, reload the window or start a new terminal, then verify with `agent -v`.",
  );
}

type SetupPickId = "docs" | "install" | "verify" | "headless";

export async function setupCursorCliInteractive(): Promise<void> {
  const items: (vscode.QuickPickItem & { id: SetupPickId })[] = [
    {
      label: "$(book) Open installation docs",
      description: DOCS_INSTALL,
      id: "docs",
    },
    {
      label: "$(terminal) Run official install script in terminal",
      description: officialInstallShellLine(),
      id: "install",
    },
    {
      label: "$(check) Verify `agent` on PATH",
      description: "Runs agent -v",
      id: "verify",
    },
    {
      label: "$(link-external) Headless / scripting docs",
      description: DOCS_HEADLESS,
      id: "headless",
    },
  ];
  const picked = await vscode.window.showQuickPick(items, {
    title: "Colcoor — Cursor CLI (`agent`)",
    placeHolder: "Choose an action",
  });
  if (!picked) {
    return;
  }
  switch (picked.id) {
    case "docs":
      await openCursorCliInstallDocs();
      break;
    case "install":
      await runCursorCliInstallerInTerminal();
      break;
    case "verify": {
      const cfg = vscode.workspace.getConfiguration("colcoor");
      const exe = (cfg.get<string>("agentExecutable") ?? "agent").trim() || "agent";
      const ok = await probeAgentExecutable(exe, 8000);
      if (ok) {
        await vscode.window.showInformationMessage(`Colcoor: \`${exe}\` is on PATH (agent -v succeeded).`);
      } else {
        await vscode.window.showWarningMessage(
          `Colcoor: \`${exe}\` not found or agent -v failed. Use “Run official install script” or set colcoor.agentExecutable.`,
        );
      }
      break;
    }
    case "headless":
      await vscode.env.openExternal(vscode.Uri.parse(DOCS_HEADLESS));
      break;
    default:
      break;
  }
}

const SKIP_PROMPT_KEY = "colcoor.skipCursorCliSetupPrompt";

/**
 * After activation, optionally prompt if `agent` is missing (non-blocking).
 */
export function scheduleCursorCliPresenceCheck(context: vscode.ExtensionContext): void {
  const delayMs = 2500;
  const handle = setTimeout(() => {
    void runCursorCliPresenceCheck(context);
  }, delayMs);
  context.subscriptions.push(new vscode.Disposable(() => clearTimeout(handle)));
}

async function runCursorCliPresenceCheck(context: vscode.ExtensionContext): Promise<void> {
  const cfg = vscode.workspace.getConfiguration("colcoor");
  if (!cfg.get<boolean>("promptForCursorCliOnActivate")) {
    return;
  }
  const mode = cfg.get<string>("agentMode") ?? "auto";
  if (mode === "stub") {
    return;
  }
  if (context.globalState.get<boolean>(SKIP_PROMPT_KEY)) {
    return;
  }
  const exe = (cfg.get<string>("agentExecutable") ?? "agent").trim() || "agent";
  const ok = await probeAgentExecutable(exe, 5000);
  if (ok) {
    return;
  }
  const choice = await vscode.window.showInformationMessage(
    "Colcoor: Cursor CLI (`agent`) was not found on PATH. Install it for real assistant replies when using Send message.",
    "Set up Cursor CLI",
    "Open docs",
    "Don't show again",
  );
  if (choice === "Set up Cursor CLI") {
    await setupCursorCliInteractive();
  } else if (choice === "Open docs") {
    await openCursorCliInstallDocs();
  } else if (choice === "Don't show again") {
    await context.globalState.update(SKIP_PROMPT_KEY, true);
  }
}
