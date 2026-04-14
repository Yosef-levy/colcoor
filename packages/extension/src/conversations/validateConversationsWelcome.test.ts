import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  colcoorCommandIdsFromPackage,
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
