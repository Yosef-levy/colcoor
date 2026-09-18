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

    const found = discoverLocalProviderCommands(root, { roots: [root] });
    expect(found.map((c) => c.name).sort()).toEqual(["deploy", "review"]);
    expect(found.find((c) => c.name === "deploy")).toMatchObject({
      source: "skill",
      argumentHint: "<env>",
      description: "Deploy the app",
    });
    expect(found.find((c) => c.name === "review")?.source).toBe("provider");
  });

  it("discovers Cursor skills from skills-cursor and .cursor/skills", () => {
    const home = mkdtempSync(join(tmpdir(), "colcoor-cursor-home-"));
    const workspace = mkdtempSync(join(tmpdir(), "colcoor-cursor-ws-"));

    mkdirSync(join(home, ".cursor", "skills-cursor", "babysit"), { recursive: true });
    writeFileSync(
      join(home, ".cursor", "skills-cursor", "babysit", "SKILL.md"),
      [
        "---",
        "name: babysit",
        "description: >-",
        "  Keep a PR merge-ready by triaging comments, resolving clear conflicts, and",
        "  fixing CI in a loop.",
        "---",
        "Do babysit.",
        "",
      ].join("\n"),
    );

    mkdirSync(join(home, ".cursor", "skills", "foo"), { recursive: true });
    writeFileSync(
      join(home, ".cursor", "skills", "foo", "SKILL.md"),
      "---\nname: foo\ndescription: Personal foo skill\n---\nFoo.\n",
    );

    mkdirSync(join(workspace, ".cursor", "skills", "project-skill"), { recursive: true });
    writeFileSync(
      join(workspace, ".cursor", "skills", "project-skill", "SKILL.md"),
      "---\nname: project-skill\ndescription: Project-local skill\n---\nGo.\n",
    );

    const found = discoverLocalProviderCommands(workspace, { homeDir: home });
    const names = found.map((c) => c.name).sort();
    expect(names).toEqual(["babysit", "foo", "project-skill"]);
    expect(found.find((c) => c.name === "babysit")).toMatchObject({
      source: "skill",
      description: "Keep a PR merge-ready by triaging comments, resolving clear conflicts, and fixing CI in a loop.",
    });
    expect(found.find((c) => c.name === "foo")?.description).toBe("Personal foo skill");
    expect(found.find((c) => c.name === "project-skill")?.description).toBe("Project-local skill");
  });

  it("prefers workspace .cursor/skills over home skills-cursor on name collision", () => {
    const home = mkdtempSync(join(tmpdir(), "colcoor-cursor-home-"));
    const workspace = mkdtempSync(join(tmpdir(), "colcoor-cursor-ws-"));

    mkdirSync(join(home, ".cursor", "skills-cursor", "loop"), { recursive: true });
    writeFileSync(
      join(home, ".cursor", "skills-cursor", "loop", "SKILL.md"),
      "---\nname: loop\ndescription: Home built-in loop\n---\nHome.\n",
    );
    mkdirSync(join(workspace, ".cursor", "skills", "loop"), { recursive: true });
    writeFileSync(
      join(workspace, ".cursor", "skills", "loop", "SKILL.md"),
      "---\nname: loop\ndescription: Workspace override loop\n---\nWs.\n",
    );

    const found = discoverLocalProviderCommands(workspace, { homeDir: home });
    expect(found.find((c) => c.name === "loop")?.description).toBe("Workspace override loop");
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
