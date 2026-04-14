import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  COLOOR_API_FAILURE_OPEN_ABOUT_ACTION,
  COLOOR_API_FAILURE_OPEN_SETTINGS_ACTION,
  COLOOR_API_FAILURE_REFRESH_CONVERSATION_TREE_ACTION,
  COLOOR_API_FAILURE_REFRESH_CONVERSATIONS_ACTION,
  COLOOR_API_FAILURE_SIGN_IN_ACTION,
} from "./colcoorApiFailureActions";

describe("colcoorApiFailureActions", () => {
  it("matches package.json title for refresh conversation tree (stale-tree warning + API toasts)", () => {
    const raw = readFileSync(resolve(__dirname, "../../package.json"), "utf8");
    const pkg = JSON.parse(raw) as {
      contributes?: { commands?: Array<{ command?: string; title?: string }> };
    };
    const title = pkg.contributes?.commands?.find((c) => c.command === "colcoor.refreshConversationTree")?.title;
    expect(COLOOR_API_FAILURE_REFRESH_CONVERSATION_TREE_ACTION).toBe(title);
  });

  it("uses Colcoor-prefixed labels suitable for toast buttons", () => {
    expect(COLOOR_API_FAILURE_OPEN_SETTINGS_ACTION).toMatch(/^Colcoor:/);
    expect(COLOOR_API_FAILURE_OPEN_ABOUT_ACTION).toMatch(/^Colcoor:/);
    expect(COLOOR_API_FAILURE_SIGN_IN_ACTION).toMatch(/^Colcoor:/);
    expect(COLOOR_API_FAILURE_REFRESH_CONVERSATIONS_ACTION).toMatch(/^Colcoor:/);
    expect(COLOOR_API_FAILURE_REFRESH_CONVERSATION_TREE_ACTION).toMatch(/^Colcoor:/);
  });
});
