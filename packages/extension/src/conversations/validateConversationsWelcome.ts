/**
 * Validates `viewsWelcome` markdown for `colcoor.conversations` so every
 * `[label](command:colcoor.foo)` references a real contributed command
 * (catches typos when editing package.json).
 */

export type PackageJsonContributesSubset = {
  contributes?: {
    commands?: Array<{ command?: string }>;
    viewsWelcome?: Array<{ view?: string; contents?: string }>;
  };
};

export function colcoorCommandIdsFromPackage(pkg: PackageJsonContributesSubset): Set<string> {
  return new Set(
    (pkg.contributes?.commands ?? [])
      .map((c) => c.command)
      .filter((c): c is string => typeof c === "string" && c.startsWith("colcoor.")),
  );
}

/** All `[text](command:…)` links in markdown (VS Code welcome format). */
export function extractMarkdownCommandLinks(contents: string): Array<{ label: string; command: string }> {
  const out: Array<{ label: string; command: string }> = [];
  const re = /\[([^\]]*)\]\(command:([^)]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(contents)) !== null) {
    out.push({ label: m[1], command: m[2] });
  }
  return out;
}

export function conversationsWelcomeContents(
  pkg: PackageJsonContributesSubset,
): string | undefined {
  const welcome = pkg.contributes?.viewsWelcome?.find((w) => w.view === "colcoor.conversations");
  return welcome?.contents;
}

/**
 * Contributed `colcoor.*` commands that must not appear as welcome `command:` links
 * (destructive actions, copy-id, palette-only anchors, or entries reachable from
 * {@link colcoor.showColcoorMenu} instead of duplicating links here).
 */
export const CONVERSATIONS_WELCOME_COMMAND_EXCLUSIONS = new Set<string>([
  "colcoor.deleteConversation",
  "colcoor.copyConversationId",
  "colcoor.continueFromHere",
  "colcoor.editProfile",
  "colcoor.openSettings",
  "colcoor.openLegalPolicySettings",
  "colcoor.openSideChatSoundSettings",
  "colcoor.setupCursorCli",
  "colcoor.setCursorAgentApiKey",
]);

/**
 * Contributed `colcoor.*` commands that lack a `(command:…)` link in the conversations
 * welcome (except {@link CONVERSATIONS_WELCOME_COMMAND_EXCLUSIONS}). Empty means full
 * discoverability coverage for new commands.
 */
export function colcoorCommandsMissingFromConversationsWelcome(
  pkg: PackageJsonContributesSubset,
): string[] {
  const contents = conversationsWelcomeContents(pkg) ?? "";
  const linkedCommands = new Set(
    extractMarkdownCommandLinks(contents)
      .map((l) => l.command)
      .filter((c) => c.startsWith("colcoor.")),
  );
  const all = colcoorCommandIdsFromPackage(pkg);
  const out: string[] = [];
  for (const cmd of all) {
    if (CONVERSATIONS_WELCOME_COMMAND_EXCLUSIONS.has(cmd)) {
      continue;
    }
    if (!linkedCommands.has(cmd)) {
      out.push(cmd);
    }
  }
  out.sort((a, b) => a.localeCompare(b));
  return out;
}

export function validateConversationsWelcomeCommands(pkg: PackageJsonContributesSubset): {
  unknownColcoor: string[];
  nonColcoor: string[];
} {
  const contents = conversationsWelcomeContents(pkg) ?? "";
  const allowed = colcoorCommandIdsFromPackage(pkg);
  const links = extractMarkdownCommandLinks(contents);
  const unknownColcoor: string[] = [];
  const nonColcoor: string[] = [];
  for (const { command } of links) {
    if (!command.startsWith("colcoor.")) {
      nonColcoor.push(command);
      continue;
    }
    if (!allowed.has(command)) {
      unknownColcoor.push(command);
    }
  }
  return { unknownColcoor, nonColcoor };
}
