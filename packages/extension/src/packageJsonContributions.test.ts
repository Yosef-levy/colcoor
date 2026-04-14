import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("package.json Colcoor contributions", () => {
  it("registers sendMessage (palette runs without a tree item; handler must tolerate undefined)", () => {
    const raw = readFileSync(resolve(__dirname, "../package.json"), "utf8");
    const pkg = JSON.parse(raw) as { contributes?: { commands?: Array<{ command?: string }> } };
    const cmds = pkg.contributes?.commands?.map((c) => c.command) ?? [];
    expect(cmds).toContain("colcoor.sendMessage");
    expect(cmds).toContain("colcoor.openLegalPolicySettings");
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
    expect(cmds).toContain("colcoor.continueFromHere");
    expect(cmds).toContain("colcoor.resendAssistant");
    expect(cmds).toContain("colcoor.jumpToLatestInConversation");
    expect(cmds).toContain("colcoor.copySelectedMessage");
    expect(cmds).toContain("colcoor.refreshConversationTree");
    expect(cmds).toContain("colcoor.refreshConversationDrawers");
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
    expect(row("colcoor.continueFromHere")).toMatchObject({
      key: "ctrl+shift+alt+h",
      when: "colcoor.conversationPanelOpen",
    });
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

  it("includes Sign out and About command links for discoverability", () => {
    const raw = readFileSync(resolve(__dirname, "../package.json"), "utf8");
    const pkg = JSON.parse(raw) as {
      contributes?: { viewsWelcome?: Array<{ view?: string; contents?: string }> };
    };
    const welcome = pkg.contributes?.viewsWelcome?.find((w) => w.view === "colcoor.conversations");
    const contents = welcome?.contents ?? "";
    expect(contents).toContain("[Sign out](command:colcoor.signOut)");
    expect(contents).toContain("[Legal policy URLs…](command:colcoor.openLegalPolicySettings)");
    expect(contents).toContain("[About](command:colcoor.openAbout)");
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

  it("links Toggle sidebar from the conversations welcome view ([ui-features.md] §4)", () => {
    const raw = readFileSync(resolve(__dirname, "../package.json"), "utf8");
    const pkg = JSON.parse(raw) as {
      contributes?: { viewsWelcome?: Array<{ view?: string; contents?: string }> };
    };
    const welcome = pkg.contributes?.viewsWelcome?.find((w) => w.view === "colcoor.conversations");
    const contents = welcome?.contents ?? "";
    expect(contents).toContain("[Toggle sidebar](command:colcoor.toggleConversationsSidebar)");
    expect(contents).toContain("[Refresh conversation tree](command:colcoor.refreshConversationTree)");
  });
});
