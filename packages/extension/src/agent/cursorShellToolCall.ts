/** @deprecated Import from `./cursorToolCallRejection` instead. */
export {
  continuationPromptAfterAllowlist,
  continuationPromptAfterRun,
  continuationPromptAfterSkip,
  shellAllowToken,
  shellCommandBaseForAllowlist,
  shellCommandBasesForAllowlist,
} from "./cursorToolCallRejection";

export type ShellToolCallRejection = {
  command: string;
  workingDirectory?: string;
  description?: string;
  sessionId?: string;
  simpleCommands?: string[];
};

export type ShellToolCallPending = {
  command?: string;
  simpleCommands?: string[];
};

import {
  enrichToolCallRejection,
  parseToolCallRejection,
  parseToolCallStarted,
  shellCommandBasesForAllowlist,
  type ToolCallRejection,
} from "./cursorToolCallRejection";

function toShellRejection(rejection: ToolCallRejection): ShellToolCallRejection | null {
  if (rejection.kind !== "shell" || !rejection.shell?.command) {
    return null;
  }
  return {
    command: rejection.shell.command,
    workingDirectory: rejection.shell.workingDirectory,
    description: rejection.shell.description,
    sessionId: rejection.sessionId,
    simpleCommands: rejection.shell.simpleCommands,
  };
}

/** @deprecated Use {@link parseToolCallRejection}. */
export function parseShellToolCallRejection(o: Record<string, unknown>): ShellToolCallRejection | null {
  const rejection = parseToolCallRejection(o);
  return rejection ? toShellRejection(rejection) : null;
}

/** @deprecated Use {@link parseToolCallStarted}. */
export function parseShellToolCallStarted(
  o: Record<string, unknown>,
): (ShellToolCallPending & { callId: string }) | null {
  const started = parseToolCallStarted(o);
  if (!started || started.kind !== "shell") {
    return null;
  }
  return {
    callId: started.callId,
    command: started.shell?.command,
    simpleCommands: started.shell?.simpleCommands,
  };
}

/** @deprecated Use {@link enrichToolCallRejection}. */
export function enrichShellToolCallRejection(
  rejection: ShellToolCallRejection,
  pending?: ShellToolCallPending | null,
): ShellToolCallRejection {
  const enriched = enrichToolCallRejection(
    {
      kind: "shell",
      title: rejection.description ?? "Shell command needs approval",
      detail: rejection.command,
      allowTokens: shellCommandBasesForAllowlist(rejection.command, rejection.simpleCommands).map(
        (b) => `Shell(${b})`,
      ),
      sessionId: rejection.sessionId,
      shell: {
        command: rejection.command,
        workingDirectory: rejection.workingDirectory,
        description: rejection.description,
        simpleCommands: rejection.simpleCommands,
      },
    },
    pending
      ? {
          kind: "shell",
          shell: {
            command: pending.command ?? "",
            simpleCommands: pending.simpleCommands,
          },
        }
      : undefined,
  );
  return toShellRejection(enriched)!;
}
