/** Parsed shell tool_call rejection from Cursor CLI stream-json. */
export type ShellToolCallRejection = {
  command: string;
  workingDirectory?: string;
  description?: string;
  sessionId?: string;
  simpleCommands?: string[];
};

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

/** First token Cursor uses for CLI allowlist matching (e.g. `npm` from `npm run build`). */
export function shellCommandBaseForAllowlist(
  command: string,
  simpleCommands?: string[],
): string | undefined {
  const fromSimple = simpleCommands?.map((s) => s.trim()).find(Boolean);
  if (fromSimple) {
    return fromSimple;
  }
  const trimmed = command.trim();
  if (!trimmed) {
    return undefined;
  }
  const first = trimmed.split(/\s+/)[0]?.replace(/^['"]|['"]$/g, "");
  return first || undefined;
}

export function shellAllowToken(commandBase: string): string {
  return `Shell(${commandBase})`;
}

/** Detect a completed shell tool_call that Cursor rejected (allowlist / policy). */
export function parseShellToolCallRejection(o: Record<string, unknown>): ShellToolCallRejection | null {
  if (o.type !== "tool_call" || o.subtype !== "completed") {
    return null;
  }
  const toolCall = o.tool_call;
  if (!toolCall || typeof toolCall !== "object") {
    return null;
  }
  const shell = (toolCall as { shellToolCall?: unknown }).shellToolCall;
  if (!shell || typeof shell !== "object") {
    return null;
  }
  const shellObj = shell as {
    args?: Record<string, unknown>;
    result?: Record<string, unknown>;
    description?: unknown;
  };
  const result = shellObj.result;
  if (!result || typeof result !== "object" || !("rejected" in result)) {
    return null;
  }
  const rejected =
    result.rejected && typeof result.rejected === "object"
      ? (result.rejected as Record<string, unknown>)
      : {};
  const args = shellObj.args ?? {};
  const command = str(args.command) ?? str(rejected.command);
  if (!command) {
    return null;
  }
  const simpleCommands = Array.isArray(args.simpleCommands)
    ? args.simpleCommands.filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    : undefined;
  const workingDirectory = str(args.workingDirectory) ?? str(rejected.workingDirectory);
  return {
    command,
    workingDirectory: workingDirectory || undefined,
    description: str(args.description) ?? str(shellObj.description),
    sessionId: str(o.session_id),
    simpleCommands,
  };
}

export function continuationPromptAfterSkip(rejection: ShellToolCallRejection): string {
  const desc = rejection.description ? ` (${rejection.description})` : "";
  return (
    `Colcoor: the user declined to run this shell command${desc}:\n` +
    `\`${rejection.command}\`\n\n` +
    "Do not retry that command unless the user asks. Continue the task without it."
  );
}

export function continuationPromptAfterAllowlist(rejection: ShellToolCallRejection): string {
  const desc = rejection.description ? ` (${rejection.description})` : "";
  return (
    `Colcoor: the user added \`${rejection.command}\`${desc} to the Cursor CLI shell allowlist. ` +
    "Retry that shell command now and continue the task."
  );
}

export function continuationPromptAfterRun(
  rejection: ShellToolCallRejection,
  exec: { exitCode: number | null; stdout: string; stderr: string },
): string {
  const desc = rejection.description ? ` (${rejection.description})` : "";
  const code = exec.exitCode == null ? "unknown" : String(exec.exitCode);
  const stdout = exec.stdout.trim() || "(empty)";
  const stderr = exec.stderr.trim() || "(empty)";
  return (
    `Colcoor: the user approved running this shell command${desc}:\n` +
    `\`${rejection.command}\`\n\n` +
    `Exit code: ${code}\nStdout:\n\`\`\`\n${stdout}\n\`\`\`\nStderr:\n\`\`\`\n${stderr}\n\`\`\`\n\n` +
    "Continue the task using this output."
  );
}
