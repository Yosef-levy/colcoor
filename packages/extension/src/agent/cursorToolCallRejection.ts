/**
 * Parse rejected Cursor CLI tool_call events (stream-json) and map them to cli-config allow tokens.
 * @see https://cursor.com/docs/cli/reference/permissions
 */

export type ToolCallKind = "shell" | "read" | "write" | "webFetch" | "webSearch" | "mcp" | "unknown";

export type ToolCallRejection = {
  kind: ToolCallKind;
  sessionId?: string;
  callId?: string;
  /** Short label for approval UI (e.g. "Read README.md"). */
  title: string;
  /** Full detail shown in the modal. */
  detail: string;
  /** Cursor CLI permission tokens for "Add to allowlist". */
  allowTokens: string[];
  /** Shell-only: run locally on "Run". */
  shell?: {
    command: string;
    workingDirectory?: string;
    description?: string;
    simpleCommands?: string[];
  };
};

export type ToolCallPending = {
  kind: ToolCallKind;
  title?: string;
  detail?: string;
  allowTokens?: string[];
  shell?: ToolCallRejection["shell"];
  readPath?: string;
  writePath?: string;
  webFetchUrl?: string;
  mcpServer?: string;
  mcpTool?: string;
};

const TOOL_KEY_TO_KIND: Record<string, ToolCallKind> = {
  shellToolCall: "shell",
  readToolCall: "read",
  editToolCall: "write",
  writeToolCall: "write",
  webFetchToolCall: "webFetch",
  fetchToolCall: "webFetch",
  webSearchToolCall: "webSearch",
  mcpToolCall: "mcp",
};

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

/** GPT models embed newlines in call_id; normalize for pending lookup. */
export function normalizeToolCallId(raw: unknown): string | undefined {
  if (typeof raw !== "string") {
    return undefined;
  }
  const collapsed = raw.trim().replace(/\s+/g, " ");
  return collapsed || undefined;
}

function rejectedReasonDetail(rejected: Record<string, unknown>, fallback: string): string {
  return str(rejected.reason) ?? fallback;
}

function webTargetFromArgs(
  args: Record<string, unknown>,
  rejected: Record<string, unknown>,
): string | undefined {
  return (
    str(args.url) ??
    str(args.uri) ??
    str(rejected.url) ??
    str(rejected.uri) ??
    str(args.query) ??
    str(args.searchTerm) ??
    str(rejected.query) ??
    str(rejected.searchTerm)
  );
}

function toolKindFromKey(key: string): ToolCallKind {
  return TOOL_KEY_TO_KIND[key] ?? "unknown";
}

function getToolCallBranch(toolCall: Record<string, unknown>): {
  key: string;
  branch: Record<string, unknown>;
  kind: ToolCallKind;
} | null {
  for (const key of Object.keys(toolCall)) {
    if (!key.endsWith("ToolCall")) {
      continue;
    }
    const branch = toolCall[key];
    if (branch && typeof branch === "object") {
      return { key, branch: branch as Record<string, unknown>, kind: toolKindFromKey(key) };
    }
  }
  return null;
}

function rejectedRecord(result: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!result || typeof result !== "object" || !("rejected" in result)) {
    return {};
  }
  const rejected = result.rejected;
  return rejected && typeof rejected === "object" ? (rejected as Record<string, unknown>) : {};
}

function shellBasesForAllowlist(command: string, simpleCommands?: string[]): string[] {
  const bases = new Set<string>();
  for (const raw of simpleCommands ?? []) {
    const base = raw.trim();
    if (base) {
      bases.add(base);
    }
  }
  if (bases.size === 0) {
    const trimmed = command.trim();
    if (trimmed) {
      const first = trimmed.split(/\s+/)[0]?.replace(/^['"]|['"]$/g, "");
      if (first) {
        bases.add(first);
      }
    }
  }
  return [...bases].map((b) => `Shell(${b})`);
}

export function domainFromWebFetchUrl(url: string): string | undefined {
  const trimmed = url.trim();
  if (!trimmed) {
    return undefined;
  }
  try {
    return new URL(trimmed).hostname || undefined;
  } catch {
    return trimmed.replace(/^https?:\/\//i, "").split("/")[0] || undefined;
  }
}

function buildRejectionFromBranch(
  kind: ToolCallKind,
  toolKey: string,
  branch: Record<string, unknown>,
  rejected: Record<string, unknown>,
): Omit<ToolCallRejection, "sessionId" | "callId"> {
  const args = (branch.args && typeof branch.args === "object" ? branch.args : {}) as Record<
    string,
    unknown
  >;

  if (kind === "shell") {
    const command = str(args.command) ?? str(rejected.command);
    if (!command) {
      return {
        kind: "unknown",
        title: "Shell command needs approval",
        detail: rejectedReasonDetail(rejected, "Shell command blocked by Cursor CLI allowlist"),
        allowTokens: [],
      };
    }
    const simpleCommands = Array.isArray(args.simpleCommands)
      ? args.simpleCommands.filter((x): x is string => typeof x === "string" && x.trim().length > 0)
      : undefined;
    const workingDirectory = str(args.workingDirectory) ?? str(rejected.workingDirectory);
    const description = str(args.description) ?? str(branch.description);
    const detail = workingDirectory
      ? `${command}\n\nWorking directory:\n${workingDirectory}`
      : command;
    return {
      kind,
      title: description ?? "Shell command needs approval",
      detail,
      allowTokens: shellBasesForAllowlist(command, simpleCommands),
      shell: {
        command,
        workingDirectory: workingDirectory || undefined,
        description,
        simpleCommands,
      },
    };
  }

  if (kind === "read") {
    const path = str(args.path) ?? str(rejected.path);
    return {
      kind,
      title: "Read file needs approval",
      detail: path ?? rejectedReasonDetail(rejected, "File read blocked by Cursor CLI allowlist"),
      allowTokens: path ? [`Read(${path})`] : ["Read(**)"],
    };
  }

  if (kind === "write") {
    const path = str(args.path) ?? str(rejected.path);
    return {
      kind,
      title: "Write file needs approval",
      detail: path ?? rejectedReasonDetail(rejected, "File write blocked by Cursor CLI allowlist"),
      allowTokens: path ? [`Write(${path})`] : ["Write(**)"],
    };
  }

  if (kind === "webFetch" || kind === "webSearch") {
    const isSearch = kind === "webSearch" || toolKey === "webSearchToolCall";
    const target = webTargetFromArgs(args, rejected);
    const domain = target ? domainFromWebFetchUrl(target) : undefined;
    return {
      kind: isSearch ? "webSearch" : "webFetch",
      title: isSearch ? "Web search needs approval" : "Web fetch needs approval",
      detail:
        target ??
        rejectedReasonDetail(
          rejected,
          isSearch
            ? "Web search blocked by Cursor CLI allowlist"
            : "Web fetch blocked by Cursor CLI allowlist",
        ),
      allowTokens: domain ? [`WebFetch(${domain})`] : ["WebFetch(*)"],
    };
  }

  if (kind === "mcp") {
    const server = str(args.server) ?? str(rejected.server) ?? str(args.mcpServer);
    const tool =
      str(args.tool) ?? str(rejected.tool) ?? str(args.toolName) ?? str(args.name);
    const token = `Mcp(${server ?? "*"}:${tool ?? "*"})`;
    const detail =
      server && tool
        ? `${server}:${tool}`
        : server ?? tool ?? rejectedReasonDetail(rejected, "MCP tool blocked by Cursor CLI allowlist");
    return {
      kind,
      title: "MCP tool needs approval",
      detail,
      allowTokens: [token],
    };
  }

  const fallback = JSON.stringify({ toolKey, ...args, ...rejected }, null, 2);
  return {
    kind: "unknown",
    title: "Tool call needs approval",
    detail: fallback.length > 2000 ? `${fallback.slice(0, 2000)}…` : fallback,
    allowTokens: [],
  };
}

function buildPendingFromBranch(
  kind: ToolCallKind,
  toolKey: string,
  branch: Record<string, unknown>,
): ToolCallPending {
  const args = (branch.args && typeof branch.args === "object" ? branch.args : {}) as Record<
    string,
    unknown
  >;
  const pending: ToolCallPending = { kind };
  const built = buildRejectionFromBranch(kind, toolKey, branch, {});
  pending.title = built.title;
  pending.detail = built.detail;
  pending.allowTokens = built.allowTokens;
  pending.shell = built.shell;
  if (kind === "read") {
    pending.readPath = str(args.path);
  }
  if (kind === "write") {
    pending.writePath = str(args.path);
  }
  if (kind === "webFetch" || kind === "webSearch") {
    pending.webFetchUrl = webTargetFromArgs(args, {});
  }
  if (kind === "mcp") {
    pending.mcpServer = str(args.server) ?? str(args.mcpServer);
    pending.mcpTool = str(args.tool) ?? str(args.toolName) ?? str(args.name);
  }
  if (kind === "shell") {
    const simpleCommands = Array.isArray(args.simpleCommands)
      ? args.simpleCommands.filter((x): x is string => typeof x === "string" && x.trim().length > 0)
      : undefined;
    pending.shell = {
      command: str(args.command) ?? "",
      workingDirectory: str(args.workingDirectory),
      description: str(args.description) ?? str(branch.description),
      simpleCommands,
    };
  }
  return pending;
}

/** Detect any completed tool_call that Cursor rejected (allowlist / policy). */
export function parseToolCallRejection(o: Record<string, unknown>): ToolCallRejection | null {
  if (o.type !== "tool_call" || o.subtype !== "completed") {
    return null;
  }
  const toolCall = o.tool_call;
  if (!toolCall || typeof toolCall !== "object") {
    return null;
  }
  const branchInfo = getToolCallBranch(toolCall as Record<string, unknown>);
  if (!branchInfo) {
    return null;
  }
  const result = branchInfo.branch.result;
  if (!result || typeof result !== "object" || !("rejected" in (result as object))) {
    return null;
  }
  const rejected = rejectedRecord(result as Record<string, unknown>);
  const built = buildRejectionFromBranch(branchInfo.kind, branchInfo.key, branchInfo.branch, rejected);
  return {
    ...built,
    sessionId: str(o.session_id),
    callId: normalizeToolCallId(o.call_id),
  };
}

/** Capture started tool_call metadata keyed by call_id for later rejection enrichment. */
export function parseToolCallStarted(
  o: Record<string, unknown>,
): (ToolCallPending & { callId: string }) | null {
  if (o.type !== "tool_call" || o.subtype !== "started") {
    return null;
  }
  const callId = normalizeToolCallId(o.call_id);
  if (!callId) {
    return null;
  }
  const toolCall = o.tool_call;
  if (!toolCall || typeof toolCall !== "object") {
    return null;
  }
  const branchInfo = getToolCallBranch(toolCall as Record<string, unknown>);
  if (!branchInfo) {
    return null;
  }
  return { callId, ...buildPendingFromBranch(branchInfo.kind, branchInfo.key, branchInfo.branch) };
}

/** Completed rejections often omit args; merge started metadata when available. */
export function enrichToolCallRejection(
  rejection: ToolCallRejection,
  pending?: ToolCallPending | null,
): ToolCallRejection {
  if (!pending || (pending.kind !== rejection.kind && !(pending.kind === "webFetch" && rejection.kind === "webSearch"))) {
    return rejection;
  }
  if (rejection.kind === "shell" && rejection.shell) {
    const shell = {
      ...rejection.shell,
      command: rejection.shell.command || pending.shell?.command || rejection.shell.command,
      simpleCommands:
        rejection.shell.simpleCommands && rejection.shell.simpleCommands.length > 0
          ? rejection.shell.simpleCommands
          : pending.shell?.simpleCommands,
      workingDirectory: rejection.shell.workingDirectory ?? pending.shell?.workingDirectory,
      description: rejection.shell.description ?? pending.shell?.description,
    };
    return {
      ...rejection,
      title: rejection.title || pending.title || rejection.title,
      detail: rejection.detail || pending.detail || rejection.detail,
      allowTokens: shellBasesForAllowlist(shell.command, shell.simpleCommands),
      shell,
    };
  }
  if (
    (rejection.kind === "webFetch" || rejection.kind === "webSearch") &&
    rejection.allowTokens.length <= 1 &&
    rejection.allowTokens[0] === "WebFetch(*)" &&
    pending.webFetchUrl
  ) {
    const domain = domainFromWebFetchUrl(pending.webFetchUrl);
    if (domain) {
      return {
        ...rejection,
        detail: pending.webFetchUrl,
        allowTokens: [`WebFetch(${domain})`],
      };
    }
  }
  if (
    rejection.allowTokens.length === 0 &&
    pending.allowTokens &&
    pending.allowTokens.length > 0
  ) {
    return {
      ...rejection,
      title: rejection.title || pending.title || rejection.title,
      detail: rejection.detail || pending.detail || rejection.detail,
      allowTokens: pending.allowTokens,
    };
  }
  if (!rejection.detail && pending.detail) {
    return { ...rejection, detail: pending.detail, title: rejection.title || pending.title || rejection.title };
  }
  return rejection;
}

export function toolCallSupportsRunOnce(rejection: ToolCallRejection): boolean {
  return rejection.kind === "shell" && Boolean(rejection.shell?.command);
}

export function continuationPromptAfterSkip(rejection: ToolCallRejection): string {
  const label =
    rejection.kind === "shell"
      ? "shell command"
      : rejection.kind === "read"
        ? "file read"
        : rejection.kind === "write"
          ? "file write"
          : rejection.kind === "webFetch"
            ? "web fetch"
            : rejection.kind === "webSearch"
              ? "web search"
              : rejection.kind === "mcp"
              ? "MCP tool call"
              : "tool call";
  return (
    `Colcoor: the user declined the blocked ${label}:\n` +
    `${rejection.detail}\n\n` +
    "Do not retry it unless the user asks. Continue the task without it."
  );
}

export function continuationPromptAfterAllowlist(rejection: ToolCallRejection): string {
  const tokens = rejection.allowTokens.length ? rejection.allowTokens.join(", ") : "allowlist";
  return (
    `Colcoor: the user added this blocked tool to the Cursor CLI allowlist (${tokens}).\n` +
    `${rejection.detail}\n\n` +
    "Retry that tool call now and continue the task."
  );
}

export function continuationPromptAfterRun(
  rejection: ToolCallRejection,
  exec: { exitCode: number | null; stdout: string; stderr: string },
): string {
  const cmd = rejection.shell?.command ?? rejection.detail;
  const code = exec.exitCode == null ? "unknown" : String(exec.exitCode);
  const stdout = exec.stdout.trim() || "(empty)";
  const stderr = exec.stderr.trim() || "(empty)";
  return (
    `Colcoor: the user approved running this shell command:\n` +
    `\`${cmd}\`\n\n` +
    `Exit code: ${code}\nStdout:\n\`\`\`\n${stdout}\n\`\`\`\nStderr:\n\`\`\`\n${stderr}\n\`\`\`\n\n` +
    "Continue the task using this output."
  );
}

// Re-export shell helpers used elsewhere / tests
export function shellCommandBasesForAllowlist(
  command: string,
  simpleCommands?: string[],
): string[] {
  return shellBasesForAllowlist(command, simpleCommands).map((t) => t.slice("Shell(".length, -1));
}

/** @deprecated Prefer {@link shellCommandBasesForAllowlist} for compound commands. */
export function shellCommandBaseForAllowlist(
  command: string,
  simpleCommands?: string[],
): string | undefined {
  return shellCommandBasesForAllowlist(command, simpleCommands)[0];
}

export function shellAllowToken(commandBase: string): string {
  return `Shell(${commandBase})`;
}
