import { spawn } from "node:child_process";

const MAX_CAPTURE_BYTES = 24 * 1024 * 1024;

export type CursorCliSpawnResult = { stdout: string; stderr: string; exitCode: number | null };

/**
 * Runs `agent -p` (Cursor headless CLI) with the given prompt; cwd and `--workspace` are set.
 * @see https://cursor.com/docs/cli/headless
 */
export function spawnCursorAgentPrint(params: {
  executable: string;
  workspaceRoot: string;
  prompt: string;
  timeoutMs: number;
}): Promise<CursorCliSpawnResult> {
  const cwd = params.workspaceRoot.trim() || process.cwd();
  const args = [
    "-p",
    "--output-format",
    "text",
    "--trust",
    "--workspace",
    cwd,
    params.prompt,
  ];

  return new Promise((resolve, reject) => {
    const child = spawn(params.executable, args, {
      cwd,
      env: process.env,
      shell: false,
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      child.kill("SIGTERM");
      reject(
        new Error(
          `Cursor agent timed out after ${params.timeoutMs}ms (Colcoor: colcoor.agentTimeoutMs).`,
        ),
      );
    }, params.timeoutMs);

    const finish = (result: CursorCliSpawnResult) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    const fail = (err: Error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      reject(err);
    };

    child.stdout?.on("data", (chunk: Buffer | string) => {
      const s = typeof chunk === "string" ? chunk : chunk.toString("utf8");
      stdoutBytes += Buffer.byteLength(s, "utf8");
      if (stdoutBytes > MAX_CAPTURE_BYTES) {
        child.kill("SIGTERM");
        fail(new Error("Cursor agent stdout exceeded Colcoor capture limit."));
        return;
      }
      stdout += s;
    });

    child.stderr?.on("data", (chunk: Buffer | string) => {
      const s = typeof chunk === "string" ? chunk : chunk.toString("utf8");
      stderrBytes += Buffer.byteLength(s, "utf8");
      if (stderrBytes > MAX_CAPTURE_BYTES) {
        child.kill("SIGTERM");
        fail(new Error("Cursor agent stderr exceeded Colcoor capture limit."));
        return;
      }
      stderr += s;
    });

    child.on("error", (err: NodeJS.ErrnoException) => {
      fail(err);
    });

    child.on("close", (exitCode, signal) => {
      if (settled) {
        return;
      }
      if (signal) {
        fail(new Error(`Cursor agent terminated by signal ${signal}.`));
        return;
      }
      finish({ stdout, stderr, exitCode: exitCode ?? null });
    });
  });
}
