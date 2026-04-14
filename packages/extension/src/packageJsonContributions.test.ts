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
});
