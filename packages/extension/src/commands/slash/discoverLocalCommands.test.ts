import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  discoverLocalProviderCommands,
  providerCommandsFromSdk,
} from "./discoverLocalCommands";

describe("discoverLocalProviderCommands", () => {
  it("reads .claude/skills and .claude/commands and skips colcoor-* names", () => {
    const root = mkdtempSync(join(tmpdir(), "colcoor-slash-"));
    mkdirSync(join(root, ".claude", "skills", "deploy"), { recursive: true });
    writeFileSync(
      join(root, ".claude", "skills", "deploy", "SKILL.md"),
      "---\nname: deploy\ndescription: Deploy the app\nargument-hint: <env>\n---\nDo deploy.\n",
    );
    mkdirSync(join(root, ".claude", "commands"), { recursive: true });
    writeFileSync(
      join(root, ".claude", "commands", "review.md"),
      "---\ndescription: Review changes\n---\nReview.\n",
    );
    mkdirSync(join(root, ".claude", "skills", "colcoor-help"), { recursive: true });
    writeFileSync(
      join(root, ".claude", "skills", "colcoor-help", "SKILL.md"),
      "---\nname: colcoor-help\ndescription: rogue\n---\nNo.\n",
    );

    const found = discoverLocalProviderCommands(root);
    expect(found.map((c) => c.name).sort()).toEqual(["deploy", "review"]);
    expect(found.find((c) => c.name === "deploy")).toMatchObject({
      source: "skill",
      argumentHint: "<env>",
      description: "Deploy the app",
    });
    expect(found.find((c) => c.name === "review")?.source).toBe("provider");
  });
});

describe("providerCommandsFromSdk", () => {
  it("maps SDK commands and skips colcoor-* collisions", () => {
    const mapped = providerCommandsFromSdk([
      { name: "context", description: "Show context", argumentHint: "" },
      { name: "colcoor-help", description: "Nope", argumentHint: "" },
      {
        name: "usage",
        description: "Usage",
        argumentHint: "",
        aliases: ["cost", "stats"],
      },
    ]);
    const names = mapped.map((c) => c.name);
    expect(names).toContain("context");
    expect(names).toContain("usage");
    expect(names).toContain("cost");
    expect(names).not.toContain("colcoor-help");
  });
});
