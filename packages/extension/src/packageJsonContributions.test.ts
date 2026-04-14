import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("package.json Colcoor contributions", () => {
  it("registers sendMessage (palette runs without a tree item; handler must tolerate undefined)", () => {
    const raw = readFileSync(resolve(__dirname, "../package.json"), "utf8");
    const pkg = JSON.parse(raw) as { contributes?: { commands?: Array<{ command?: string }> } };
    const cmds = pkg.contributes?.commands?.map((c) => c.command) ?? [];
    expect(cmds).toContain("colcoor.sendMessage");
  });

  it("documents sendMessage prompts including optional checkpoint ([ui-features.md] §9)", () => {
    const raw = readFileSync(resolve(__dirname, "../package.json"), "utf8");
    const pkg = JSON.parse(raw) as {
      contributes?: { commands?: Array<{ command?: string; title?: string; description?: string }> };
    };
    const send = pkg.contributes?.commands?.find((c) => c.command === "colcoor.sendMessage");
    expect(send?.title).toBe("Colcoor: Send message…");
    expect(send?.description).toContain("checkpoint");
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
    expect(contents).toContain("[About](command:colcoor.openAbout)");
  });

  it("links Toggle sidebar from the conversations welcome view ([ui-features.md] §4)", () => {
    const raw = readFileSync(resolve(__dirname, "../package.json"), "utf8");
    const pkg = JSON.parse(raw) as {
      contributes?: { viewsWelcome?: Array<{ view?: string; contents?: string }> };
    };
    const welcome = pkg.contributes?.viewsWelcome?.find((w) => w.view === "colcoor.conversations");
    const contents = welcome?.contents ?? "";
    expect(contents).toContain("[Toggle sidebar](command:colcoor.toggleConversationsSidebar)");
  });
});
