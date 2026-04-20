/**
 * Validates `viewsWelcome` markdown for `colcoor.conversations` so every
 * `[label](command:colcoor.foo)` references a real contributed command
 * (catches typos when editing package.json).
 */

export type PackageJsonContributesSubset = {
  contributes?: {
    commands?: Array<{ command?: string }>;
    viewsWelcome?: Array<{ view?: string; when?: string; contents?: string }>;
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

/** Every `viewsWelcome` row for `colcoor.conversations` (may use different `when` clauses). */
export function allConversationsWelcomeViews(
  pkg: PackageJsonContributesSubset,
): Array<{ when?: string; contents?: string }> {
  return pkg.contributes?.viewsWelcome?.filter((w) => w.view === "colcoor.conversations") ?? [];
}

/** Concatenated markdown for tests and link discovery (all welcome blocks for this view). */
export function conversationsWelcomeContents(
  pkg: PackageJsonContributesSubset,
): string | undefined {
  const parts = allConversationsWelcomeViews(pkg)
    .map((w) => w.contents)
    .filter((c): c is string => typeof c === "string" && c.length > 0);
  if (parts.length === 0) {
    return undefined;
  }
  return parts.join("\n");
}

/**
 * Contributed `colcoor.*` commands not linked from the minimal conversations `viewsWelcome`
 * (logged-out strip, signed-in strip, and optional API-key strip). Everything else is
 * reachable from the Command Palette, conversation UI, row ⋯ menu, or **Colcoor menu…**.
 */
export const CONVERSATIONS_WELCOME_COMMAND_EXCLUSIONS = new Set<string>([
  "colcoor.addConversationMember",
  "colcoor.addNoteToSelectedMessage",
  "colcoor.changeMemberRole",
  "colcoor.continueFromHere",
  "colcoor.copyConversationId",
  "colcoor.copySelectedMessage",
  "colcoor.deleteConversation",
  "colcoor.deleteSelectedMessageSubtree",
  "colcoor.editProfile",
  "colcoor.jumpToLatestInConversation",
  "colcoor.listConversationMembers",
  "colcoor.listStarredMessagesInConversation",
  "colcoor.listTodoNotesInConversation",
  "colcoor.openConversation",
  "colcoor.openConversationDrawers",
  "colcoor.openLegalPolicySettings",
  "colcoor.openSettings",
  "colcoor.openSideChat",
  "colcoor.openSideChatSoundSettings",
  "colcoor.referenceSelectedMessageInSideChat",
  "colcoor.referenceSelectedNoteInSideChat",
  "colcoor.refreshConversationDrawers",
  "colcoor.refreshConversationTree",
  "colcoor.refreshConversations",
  "colcoor.removeMemberFromConversation",
  "colcoor.renameConversation",
  "colcoor.resendAssistant",
  "colcoor.restoreMessageBranch",
  "colcoor.sendMessage",
  "colcoor.showNotesOnSelectedMessage",
  "colcoor.stopGeneration",
  "colcoor.testSideChatSound",
  "colcoor.togglePinnedConversation",
  "colcoor.toggleStarSelectedMessage",
]);

/**
 * Contributed `colcoor.*` commands that lack a `(command:…)` link in the conversations
 * welcome (except {@link CONVERSATIONS_WELCOME_COMMAND_EXCLUSIONS}). Empty means full
 * discoverability coverage for new commands.
 */
export function colcoorCommandsMissingFromConversationsWelcome(
  pkg: PackageJsonContributesSubset,
): string[] {
  const linkedCommands = new Set<string>();
  for (const w of allConversationsWelcomeViews(pkg)) {
    for (const { command } of extractMarkdownCommandLinks(w.contents ?? "")) {
      if (command.startsWith("colcoor.")) {
        linkedCommands.add(command);
      }
    }
  }
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
  const allowed = colcoorCommandIdsFromPackage(pkg);
  const unknownColcoor = new Set<string>();
  const nonColcoor = new Set<string>();
  for (const w of allConversationsWelcomeViews(pkg)) {
    for (const { command } of extractMarkdownCommandLinks(w.contents ?? "")) {
      if (!command.startsWith("colcoor.")) {
        nonColcoor.add(command);
        continue;
      }
      if (!allowed.has(command)) {
        unknownColcoor.add(command);
      }
    }
  }
  return {
    unknownColcoor: [...unknownColcoor].sort(),
    nonColcoor: [...nonColcoor].sort(),
  };
}
