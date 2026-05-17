import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  colcoorCommandIdsFromPackage,
  colcoorCommandsMissingFromConversationsWelcome,
  CONVERSATIONS_WELCOME_COMMAND_EXCLUSIONS,
  conversationsWelcomeContents,
  extractMarkdownCommandLinks,
  validateConversationsWelcomeCommands,
} from "./validateConversationsWelcome";

describe("validateConversationsWelcomeCommands", () => {
  it("allows every colcoor command link in the real conversations welcome", () => {
    const raw = readFileSync(resolve(__dirname, "../../package.json"), "utf8");
    const pkg = JSON.parse(raw) as Parameters<typeof validateConversationsWelcomeCommands>[0];
    const { unknownColcoor, nonColcoor } = validateConversationsWelcomeCommands(pkg);
    expect(nonColcoor).toEqual([]);
    expect(unknownColcoor).toEqual([]);
  });

  it("flags unknown colcoor.* links", () => {
    const { unknownColcoor, nonColcoor } = validateConversationsWelcomeCommands({
      contributes: {
        commands: [{ command: "colcoor.signIn" }],
        viewsWelcome: [{ view: "colcoor.conversations", contents: "[x](command:colcoor.typoHere)" }],
      },
    });
    expect(nonColcoor).toEqual([]);
    expect(unknownColcoor).toEqual(["colcoor.typoHere"]);
  });

  it("flags non-colcoor command schemes", () => {
    const { unknownColcoor, nonColcoor } = validateConversationsWelcomeCommands({
      contributes: {
        commands: [{ command: "colcoor.signIn" }],
        viewsWelcome: [{ view: "colcoor.conversations", contents: "[bad](command:workbench.action.files.newUntitledFile)" }],
      },
    });
    expect(nonColcoor).toEqual(["workbench.action.files.newUntitledFile"]);
    expect(unknownColcoor).toEqual([]);
  });
});

describe("colcoorCommandsMissingFromConversationsWelcome", () => {
  it("requires every contributed colcoor command in welcome except explicit exclusions", () => {
    const raw = readFileSync(resolve(__dirname, "../../package.json"), "utf8");
    const pkg = JSON.parse(raw) as Parameters<typeof colcoorCommandsMissingFromConversationsWelcome>[0];
    expect(colcoorCommandsMissingFromConversationsWelcome(pkg)).toEqual([]);
  });

  it("documents welcome exclusions (minimal logged-out welcome; other commands via menu / UI)", () => {
    expect([...CONVERSATIONS_WELCOME_COMMAND_EXCLUSIONS].sort()).toEqual([
      "colcoor.addConversationMember",
      "colcoor.addNoteToSelectedMessage",
      "colcoor.changeMemberRole",
      "colcoor.continueFromHere",
      "colcoor.copyConversationId",
      "colcoor.copySelectedMessage",
      "colcoor.deleteConversation",
      "colcoor.deleteSelectedMessageSubtree",
      "colcoor.editProfile",
      "colcoor.editUserMessage",
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
  });

  it("flags commands absent from welcome when not excluded", () => {
    const missing = colcoorCommandsMissingFromConversationsWelcome({
      contributes: {
        commands: [{ command: "colcoor.signIn" }, { command: "colcoor.testMissingFromWelcome" }],
        viewsWelcome: [{ view: "colcoor.conversations", contents: "[in](command:colcoor.signIn)" }],
      },
    });
    expect(missing).toEqual(["colcoor.testMissingFromWelcome"]);
  });

  it("does not require excluded commands to appear in welcome", () => {
    const contents = conversationsWelcomeContents({
      contributes: {
        commands: [{ command: "colcoor.signIn" }, { command: "colcoor.deleteConversation" }],
        viewsWelcome: [{ view: "colcoor.conversations", contents: "[in](command:colcoor.signIn)" }],
      },
    });
    expect(contents).not.toContain("deleteConversation");
    expect(
      colcoorCommandsMissingFromConversationsWelcome({
        contributes: {
          commands: [{ command: "colcoor.signIn" }, { command: "colcoor.deleteConversation" }],
          viewsWelcome: [{ view: "colcoor.conversations", contents: "[in](command:colcoor.signIn)" }],
        },
      }),
    ).toEqual([]);
  });
});

describe("conversations welcome delete discoverability", () => {
  it("mentions delete without a deleteConversation command link", () => {
    const raw = readFileSync(resolve(__dirname, "../../package.json"), "utf8");
    const pkg = JSON.parse(raw) as Parameters<typeof conversationsWelcomeContents>[0];
    const contents = conversationsWelcomeContents(pkg);
    expect(contents.toLowerCase()).toMatch(/delete/);
    expect(contents).not.toContain("command:colcoor.deleteConversation");
  });
});

describe("extractMarkdownCommandLinks", () => {
  it("parses multiple links", () => {
    const md = "[A](command:colcoor.a)\n[B](command:colcoor.b)";
    expect(extractMarkdownCommandLinks(md)).toEqual([
      { label: "A", command: "colcoor.a" },
      { label: "B", command: "colcoor.b" },
    ]);
  });
});

describe("colcoorCommandIdsFromPackage", () => {
  it("collects only colcoor.* ids", () => {
    const s = colcoorCommandIdsFromPackage({
      contributes: {
        commands: [{ command: "colcoor.x" }, { command: "other.ext" }, { command: "colcoor.y" }],
      },
    });
    expect([...s].sort()).toEqual(["colcoor.x", "colcoor.y"]);
  });
});
