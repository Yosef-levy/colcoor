import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  COLOOR_API_FAILURE_OPEN_ABOUT_ACTION,
  COLOOR_API_FAILURE_OPEN_SETTINGS_ACTION,
  COLOOR_API_FAILURE_REFRESH_CONVERSATION_TREE_ACTION,
  COLOOR_API_FAILURE_REFRESH_CONVERSATIONS_ACTION,
  COLOOR_API_FAILURE_SIGN_IN_ACTION,
} from "./util/colcoorApiFailureActions";

type ViewsWelcomeRow = { view?: string; when?: string; contents?: string };

function colcoorConversationWelcomes(pkg: {
  contributes?: { viewsWelcome?: ViewsWelcomeRow[] };
}): ViewsWelcomeRow[] {
  return pkg.contributes?.viewsWelcome?.filter((w) => w.view === "colcoor.conversations") ?? [];
}

describe("package.json Colcoor contributions", () => {
  it("registers sendMessage (palette runs without a tree item; handler must tolerate undefined)", () => {
    const raw = readFileSync(resolve(__dirname, "../package.json"), "utf8");
    const pkg = JSON.parse(raw) as { contributes?: { commands?: Array<{ command?: string }> } };
    const cmds = pkg.contributes?.commands?.map((c) => c.command) ?? [];
    expect(cmds).toContain("colcoor.sendMessage");
    expect(cmds).toContain("colcoor.openLegalPolicySettings");
    expect(cmds).toContain("colcoor.openSideChatSoundSettings");
    expect(cmds).toContain("colcoor.testSideChatSound");
  });

  it("documents jumpToLatestInConversation for default-branch navigation ([ui-features.md] §6)", () => {
    const raw = readFileSync(resolve(__dirname, "../package.json"), "utf8");
    const pkg = JSON.parse(raw) as {
      contributes?: { commands?: Array<{ command?: string; title?: string; description?: string }> };
    };
    const jump = pkg.contributes?.commands?.find((c) => c.command === "colcoor.jumpToLatestInConversation");
    expect(jump?.title).toBe("Colcoor: Jump to latest in conversation");
    expect(jump?.description).toContain("default branch");
  });

  it("documents sendMessage prompts including optional checkpoint ([ui-features.md] §9)", () => {
    const raw = readFileSync(resolve(__dirname, "../package.json"), "utf8");
    const pkg = JSON.parse(raw) as {
      contributes?: { commands?: Array<{ command?: string; title?: string; description?: string }> };
    };
    const send = pkg.contributes?.commands?.find((c) => c.command === "colcoor.sendMessage");
    expect(send?.title).toBe("Colcoor: Send message…");
    expect(send?.description).toContain("checkpoint");
    expect(send?.description).toContain("private");
    expect(send?.description).toContain("multiline");
  });

  it("registers stopGeneration for conversation panel abort (enablement uses reply-in-progress context)", () => {
    const raw = readFileSync(resolve(__dirname, "../package.json"), "utf8");
    const pkg = JSON.parse(raw) as {
      contributes?: {
        commands?: Array<{ command?: string; enablement?: string }>;
      };
    };
    const stop = pkg.contributes?.commands?.find((c) => c.command === "colcoor.stopGeneration");
    expect(stop?.enablement).toBe("colcoor.conversationReplyInProgress");
  });

  it("registers newConversation and openSideChat for palette and menus", () => {
    const raw = readFileSync(resolve(__dirname, "../package.json"), "utf8");
    const pkg = JSON.parse(raw) as { contributes?: { commands?: Array<{ command?: string }> } };
    const cmds = pkg.contributes?.commands?.map((c) => c.command) ?? [];
    expect(cmds).toContain("colcoor.newConversation");
    expect(cmds).toContain("colcoor.openSideChat");
    expect(cmds).toContain("colcoor.showColcoorMenu");
    expect(cmds).toContain("colcoor.continueFromHere");
    expect(cmds).toContain("colcoor.resendAssistant");
    expect(cmds).toContain("colcoor.jumpToLatestInConversation");
    expect(cmds).toContain("colcoor.copySelectedMessage");
    expect(cmds).toContain("colcoor.refreshConversationTree");
    expect(cmds).toContain("colcoor.refreshConversationDrawers");
  });

  it("matches showColcoorApiFailure toast action labels to command titles ([ui-features.md] §12)", () => {
    const raw = readFileSync(resolve(__dirname, "../package.json"), "utf8");
    const pkg = JSON.parse(raw) as {
      contributes?: { commands?: Array<{ command?: string; title?: string }> };
    };
    const titleOf = (command: string) => pkg.contributes?.commands?.find((c) => c.command === command)?.title;
    expect(titleOf("colcoor.openSettings")).toBe(COLOOR_API_FAILURE_OPEN_SETTINGS_ACTION);
    expect(titleOf("colcoor.openAbout")).toBe(COLOOR_API_FAILURE_OPEN_ABOUT_ACTION);
    expect(titleOf("colcoor.signIn")).toBe(COLOOR_API_FAILURE_SIGN_IN_ACTION);
    expect(titleOf("colcoor.refreshConversations")).toBe(COLOOR_API_FAILURE_REFRESH_CONVERSATIONS_ACTION);
    expect(titleOf("colcoor.refreshConversationTree")).toBe(COLOOR_API_FAILURE_REFRESH_CONVERSATION_TREE_ACTION);
  });

  it("documents refreshConversationDrawers for starred/TODO reload ([ui-features.md] §11)", () => {
    const raw = readFileSync(resolve(__dirname, "../package.json"), "utf8");
    const pkg = JSON.parse(raw) as {
      contributes?: { commands?: Array<{ command?: string; title?: string; description?: string }> };
    };
    const cmd = pkg.contributes?.commands?.find((c) => c.command === "colcoor.refreshConversationDrawers");
    expect(cmd?.title).toBe("Colcoor: Refresh conversation drawers");
    expect(cmd?.description).toMatch(/starred|TODO/i);
  });

  it("documents refreshConversationTree for reloading the open panel ([ui-features.md] §6)", () => {
    const raw = readFileSync(resolve(__dirname, "../package.json"), "utf8");
    const pkg = JSON.parse(raw) as {
      contributes?: { commands?: Array<{ command?: string; title?: string; description?: string }> };
    };
    const cmd = pkg.contributes?.commands?.find((c) => c.command === "colcoor.refreshConversationTree");
    expect(cmd?.title).toBe("Colcoor: Refresh conversation tree");
    expect(cmd?.description).toContain("server");
  });

  it("documents copySelectedMessage for thread copy ([ui-features.md] §7)", () => {
    const raw = readFileSync(resolve(__dirname, "../package.json"), "utf8");
    const pkg = JSON.parse(raw) as {
      contributes?: { commands?: Array<{ command?: string; title?: string; description?: string }> };
    };
    const copy = pkg.contributes?.commands?.find((c) => c.command === "colcoor.copySelectedMessage");
    expect(copy?.title).toBe("Colcoor: Copy selected message");
    expect(copy?.description).toContain("clipboard");
  });

  it("contributes default keybindings gated on conversation panel open ([tree-ui-contract.md] §6)", () => {
    const raw = readFileSync(resolve(__dirname, "../package.json"), "utf8");
    const pkg = JSON.parse(raw) as {
      contributes?: {
        keybindings?: Array<{ command?: string; key?: string; when?: string }>;
      };
    };
    const kb = pkg.contributes?.keybindings ?? [];
    const row = (cmd: string) => kb.find((k) => k.command === cmd);
    expect(row("colcoor.jumpToLatestInConversation")).toMatchObject({
      command: "colcoor.jumpToLatestInConversation",
      key: "ctrl+shift+alt+j",
      when: "colcoor.conversationPanelOpen",
    });
    expect(row("colcoor.continueFromHere")).toBeUndefined();
    expect(row("colcoor.resendAssistant")).toMatchObject({
      key: "ctrl+shift+alt+e",
      when: "colcoor.conversationPanelOpen",
    });
    expect(row("colcoor.copySelectedMessage")).toMatchObject({
      key: "ctrl+shift+alt+c",
      when: "colcoor.conversationPanelOpen",
    });
    expect(row("colcoor.refreshConversationTree")).toMatchObject({
      key: "ctrl+shift+alt+t",
      when: "colcoor.conversationPanelOpen",
    });
    expect(row("colcoor.toggleStarSelectedMessage")).toMatchObject({
      key: "ctrl+shift+alt+8",
      when: "colcoor.conversationPanelOpen",
    });
    expect(row("colcoor.stopGeneration")).toMatchObject({
      key: "ctrl+shift+alt+b",
      when: "colcoor.conversationReplyInProgress && colcoor.conversationPanelOpen",
    });
  });

  it("registers each contributed command id at most once", () => {
    const raw = readFileSync(resolve(__dirname, "../package.json"), "utf8");
    const pkg = JSON.parse(raw) as { contributes?: { commands?: Array<{ command?: string }> } };
    const cmds = pkg.contributes?.commands?.map((c) => c.command).filter((c): c is string => Boolean(c)) ?? [];
    expect(new Set(cmds).size).toBe(cmds.length);
  });

  it("uses a minimal logged-out conversations welcome (sign in, menu, help, toggle)", () => {
    const raw = readFileSync(resolve(__dirname, "../package.json"), "utf8");
    const pkg = JSON.parse(raw) as { contributes?: { viewsWelcome?: ViewsWelcomeRow[] } };
    const loggedOut = colcoorConversationWelcomes(pkg).find((w) => w.when === "!colcoor.backendSignedIn");
    const contents = loggedOut?.contents ?? "";
    expect(contents).toContain("[Sign in](command:colcoor.signIn)");
    expect(contents).toContain("[Colcoor menu…](command:colcoor.showColcoorMenu)");
    expect(contents).toContain("[Help…](command:colcoor.openAbout)");
    expect(contents).not.toContain("[Sign out](command:colcoor.signOut)");
    expect(contents).not.toContain("command:colcoor.openLegalPolicySettings");
    expect(contents).not.toContain("command:colcoor.openSideChatSoundSettings");
    expect(contents).not.toContain("[About](command:colcoor.openAbout)");
  });

  it("registers signed-in empty-list welcome (add conversation, sign out, menu, help, toggle)", () => {
    const raw = readFileSync(resolve(__dirname, "../package.json"), "utf8");
    const pkg = JSON.parse(raw) as { contributes?: { viewsWelcome?: ViewsWelcomeRow[] } };
    const signedIn = colcoorConversationWelcomes(pkg).find((w) => w.when === "colcoor.backendSignedIn");
    const contents = signedIn?.contents ?? "";
    expect(contents).toContain("[Add conversation](command:colcoor.newConversation)");
    expect(contents).toContain("[Sign out](command:colcoor.signOut)");
    expect(contents).not.toContain("command:colcoor.signIn");
    expect(contents).toContain("[Colcoor menu…](command:colcoor.showColcoorMenu)");
    expect(contents).toContain("[Toggle sidebar](command:colcoor.toggleConversationsSidebar)");
  });

  it("registers API-key hint welcome when signed in and key unset", () => {
    const raw = readFileSync(resolve(__dirname, "../package.json"), "utf8");
    const pkg = JSON.parse(raw) as { contributes?: { viewsWelcome?: ViewsWelcomeRow[] } };
    const api = colcoorConversationWelcomes(pkg).find((w) =>
      String(w.when ?? "").includes("cursorAgentApiKeySet"),
    );
    const contents = api?.contents ?? "";
    expect(api?.when).toContain("colcoor.backendSignedIn");
    expect(contents).toContain("[Set Cursor API key…](command:colcoor.setCursorAgentApiKey)");
    expect(contents).toContain("[Set up Cursor CLI (agent)…](command:colcoor.setupCursorCli)");
  });

  it("documents openLegalPolicySettings for Terms / Privacy / Refund URLs ([ui-features.md] §1.3)", () => {
    const raw = readFileSync(resolve(__dirname, "../package.json"), "utf8");
    const pkg = JSON.parse(raw) as {
      contributes?: { commands?: Array<{ command?: string; title?: string; description?: string }> };
    };
    const cmd = pkg.contributes?.commands?.find((c) => c.command === "colcoor.openLegalPolicySettings");
    expect(cmd?.title).toBe("Colcoor: Open legal policy settings…");
    expect(cmd?.description).toContain("Terms");
  });

  it("documents openSideChatSoundSettings for side-chat sounds and notifications ([ui-features.md] §1.1)", () => {
    const raw = readFileSync(resolve(__dirname, "../package.json"), "utf8");
    const pkg = JSON.parse(raw) as {
      contributes?: { commands?: Array<{ command?: string; title?: string; description?: string }> };
    };
    const cmd = pkg.contributes?.commands?.find((c) => c.command === "colcoor.openSideChatSoundSettings");
    expect(cmd?.title).toBe("Colcoor: Open side chat sound & notification settings…");
    expect(cmd?.description).toContain("§1.1");
    expect(cmd?.description).toMatch(/sound|notification/i);
  });

  it("documents side-chat test-sound command for local preview", () => {
    const raw = readFileSync(resolve(__dirname, "../package.json"), "utf8");
    const pkg = JSON.parse(raw) as {
      contributes?: { commands?: Array<{ command?: string; title?: string; description?: string }> };
    };
    const cmd = pkg.contributes?.commands?.find((c) => c.command === "colcoor.testSideChatSound");
    expect(cmd?.title).toBe("Colcoor: Test side chat sound…");
    expect(cmd?.description).toMatch(/preview|sound/i);
  });


  it("links Toggle sidebar from the conversations welcome view ([ui-features.md] §4)", () => {
    const raw = readFileSync(resolve(__dirname, "../package.json"), "utf8");
    const pkg = JSON.parse(raw) as { contributes?: { viewsWelcome?: ViewsWelcomeRow[] } };
    const joined = colcoorConversationWelcomes(pkg)
      .map((w) => w.contents ?? "")
      .join("\n");
    expect(joined).toContain("[Toggle sidebar](command:colcoor.toggleConversationsSidebar)");
    expect(joined).not.toContain("command:colcoor.refreshConversationTree");
  });

  it("does not duplicate palette-only conversation commands in the minimal welcome", () => {
    const raw = readFileSync(resolve(__dirname, "../package.json"), "utf8");
    const pkg = JSON.parse(raw) as { contributes?: { viewsWelcome?: ViewsWelcomeRow[] } };
    const contents = colcoorConversationWelcomes(pkg)
      .filter((w) => !String(w.when ?? "").includes("cursorAgentApiKeySet"))
      .map((w) => w.contents ?? "")
      .join("\n");
    expect(contents).not.toContain("command:colcoor.sendMessage");
    expect(contents).not.toContain("command:colcoor.stopGeneration");
    expect(contents).not.toContain("command:colcoor.jumpToLatestInConversation");
    expect(contents).not.toContain("command:colcoor.continueFromHere");
    expect(contents).not.toContain("command:colcoor.resendAssistant");
    expect(contents).not.toContain("command:colcoor.copySelectedMessage");
    expect(contents).not.toContain("command:colcoor.deleteSelectedMessageSubtree");
    expect(contents).not.toContain("command:colcoor.restoreMessageBranch");
  });

  it("does not duplicate rename / pin / star welcome links (use Colcoor menu or open conversation)", () => {
    const raw = readFileSync(resolve(__dirname, "../package.json"), "utf8");
    const pkg = JSON.parse(raw) as { contributes?: { viewsWelcome?: ViewsWelcomeRow[] } };
    const contents = colcoorConversationWelcomes(pkg)
      .map((w) => w.contents ?? "")
      .join("\n");
    expect(contents).not.toContain("command:colcoor.renameConversation");
    expect(contents).not.toContain("command:colcoor.togglePinnedConversation");
    expect(contents).not.toContain("command:colcoor.toggleStarSelectedMessage");
  });

  it("does not duplicate members / drawers / notes / side-chat reference links in the welcome", () => {
    const raw = readFileSync(resolve(__dirname, "../package.json"), "utf8");
    const pkg = JSON.parse(raw) as { contributes?: { viewsWelcome?: ViewsWelcomeRow[] } };
    const contents = colcoorConversationWelcomes(pkg)
      .map((w) => w.contents ?? "")
      .join("\n");
    expect(contents).not.toContain("command:colcoor.copyConversationId");
    expect(contents).not.toContain("command:colcoor.listConversationMembers");
    expect(contents).not.toContain("command:colcoor.refreshConversationDrawers");
    expect(contents).not.toContain("command:colcoor.addNoteToSelectedMessage");
    expect(contents).not.toContain("command:colcoor.showNotesOnSelectedMessage");
    expect(contents).not.toContain("command:colcoor.referenceSelectedMessageInSideChat");
    expect(contents).not.toContain("command:colcoor.referenceSelectedNoteInSideChat");
  });

  it("does not link member mutations or delete from the minimal welcome", () => {
    const raw = readFileSync(resolve(__dirname, "../package.json"), "utf8");
    const pkg = JSON.parse(raw) as { contributes?: { viewsWelcome?: ViewsWelcomeRow[] } };
    const contents = colcoorConversationWelcomes(pkg)
      .map((w) => w.contents ?? "")
      .join("\n");
    expect(contents).not.toContain("command:colcoor.addConversationMember");
    expect(contents).not.toContain("command:colcoor.changeMemberRole");
    expect(contents).not.toContain("command:colcoor.removeMemberFromConversation");
    expect(contents).not.toContain("command:colcoor.deleteConversation");
  });

});
