import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import type * as vscode from "vscode";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  builtInConversationTemplates,
  ConversationTemplateRepository,
} from "./conversationTemplates";

let root: string;
let repository: ConversationTemplateRepository;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "colcoor-templates-"));
  repository = new ConversationTemplateRepository({ fsPath: root } as vscode.Uri);
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

describe("conversation templates", () => {
  it("ships the complete immutable built-in catalog", () => {
    const templates = builtInConversationTemplates();
    expect(templates.map((row) => row.name)).toEqual([
      "Learning / tutoring",
      "Structured learning program",
      "Research",
    ]);
    expect(
      templates
        .find((row) => row.name === "Structured learning program")
        ?.notes.some((note) => note.includes(".colcoor/docs/<conversation_id>_syllabus.md")),
    ).toBe(true);
    templates[0].notes[0] = "changed";
    expect(builtInConversationTemplates()[0].notes[0]).toBe(
      "This is a learning conversation.",
    );
  });

  it("creates, updates, and deletes machine-local custom templates", async () => {
    const draft = await repository.createDraft();
    await repository.upsert({
      ...draft,
      name: "My template",
      notes: ["First rule", "Second rule"],
    });
    expect((await repository.listAll()).at(-1)?.name).toBe("My template");

    await repository.upsert({
      ...draft,
      name: "Updated",
      notes: ["Updated rule"],
    });
    expect((await repository.listCustom())[0].notes).toEqual(["Updated rule"]);

    await repository.delete(draft.id);
    expect(await repository.listCustom()).toEqual([]);
  });

  it("backs up malformed persisted JSON and recovers with built-ins", async () => {
    await fs.writeFile(path.join(root, "conversation-templates.v1.json"), "{broken", "utf8");
    expect((await repository.listAll()).map((row) => row.name)).toEqual([
      "Learning / tutoring",
      "Structured learning program",
      "Research",
    ]);
    expect((await fs.readdir(root)).some((name) => name.includes(".invalid-"))).toBe(true);
  });

  it("imports and exports a versioned custom template file", async () => {
    const count = await repository.importJson(
      JSON.stringify({
        version: 1,
        templates: [
          { id: "custom:portable", name: "Portable", description: "", notes: ["Rule"] },
        ],
      }),
    );
    expect(count).toBe(1);
    expect(JSON.parse(await repository.exportJson()).templates[0].id).toBe("custom:portable");
  });
});
