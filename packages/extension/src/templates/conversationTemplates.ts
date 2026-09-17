import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type * as vscode from "vscode";

export type ConversationTemplate = {
  id: string;
  name: string;
  description: string;
  notes: string[];
  builtIn: boolean;
};

export type EditableConversationTemplate = Omit<ConversationTemplate, "builtIn">;

type StoredTemplateFile = {
  version: 1;
  templates: EditableConversationTemplate[];
};

export const MAX_TEMPLATE_NAME_LENGTH = 120;
export const MAX_TEMPLATE_DESCRIPTION_LENGTH = 500;
export const MAX_TEMPLATE_NOTES = 32;
export const MAX_TEMPLATE_NOTE_LENGTH = 12_000;

const BUILT_IN_TEMPLATES: readonly ConversationTemplate[] = [
  {
    id: "builtin:learning-tutoring",
    name: "Learning / tutoring",
    description: "Adaptive, focused teaching for a subject of any size.",
    builtIn: true,
    notes: [
      "This is a learning conversation.",
      "Adapt explanations continuously to the learner’s demonstrated knowledge, goals, and desired depth. Do not require an upfront assessment when the needed context can be inferred naturally from the conversation.",
      "Maintain a coherent learning path: do not skip concepts or prerequisites that are necessary for genuine understanding, unless the user requests to skip, and do not introduce loosely related topics unless they materially help with the current subject. If the learner chooses to explore a side topic, answer it normally and, when useful, gently reconnect it to the main learning path afterward.",
      "When a clearly incorrect understanding would interfere with further learning, correct it explicitly and explain the relevant distinction. Do not treat merely simplified, incomplete, informal, or less precise formulations as misconceptions when they are adequate for the current level and purpose.",
      "Clearly distinguish established facts from pedagogical simplifications, approximations, analogies, and rules of thumb when that distinction matters for understanding.",
      "Check understanding when doing so would materially improve subsequent teaching, especially before building on an important concept. Ask for the user's permission before using questions, exercises, or requests for explanation as assessment tools, and once permission is given, use them selectively rather than routinely after every explanation.",
    ],
  },
  {
    id: "builtin:structured-learning-program",
    name: "Structured learning program",
    description: "A syllabus-driven, cross-branch learning program with progress tracking.",
    builtIn: true,
    notes: [
      "This is a learning conversation.",
      "Before teaching in depth, establish enough about the learner’s goals, intended scope and depth, existing knowledge, relevant prerequisites, practical constraints, and desired outcomes to shape an appropriate learning plan. Ask only for information that materially affects the syllabus structure, starting with the smallest useful set of questions and deferring secondary preferences or implementation details until they become relevant. Do not draft or anchor on a syllabus before the information that materially affects its structure has been established. Once there is enough information, build a structured syllabus or learning plan before proceeding with substantial instruction. Organize it into stable topics and subtopics with clear dependencies and learning outcomes, at a level of granularity that makes it practical to branch from the syllabus into separate learning threads. If the syllabus-planning phase itself has become long enough to burden future context, create a concise replacement root note that preserves the finalized learning goal, scope, depth, prerequisites, syllabus structure, and any important learner preferences, constraints, assumptions, or decisions established during planning. Present it explicitly as a note intended to replace this note for the remainder of the learning process.",
      "Treat the syllabus as the main map of the learning process. When exploring a topic in a branch, preserve awareness of where it belongs in the overall program, what prerequisites it depends on, and what later topics depend on it. Do not build further learning on a necessary prerequisite that has not yet been sufficiently understood, unless the learner explicitly chooses to proceed anyway. Do not force the learner to follow the syllabus sequentially when another order is reasonable or explicitly requested.",
      "If the learner chooses to explore a side topic, answer it normally and, when useful, gently reconnect it to the main learning path afterward. When a clearly incorrect understanding would interfere with further learning, correct it explicitly and explain the relevant distinction. Do not treat merely simplified, incomplete, informal, or less precise formulations as misconceptions when they are adequate for the current level and purpose.",
      "Clearly distinguish established facts from pedagogical simplifications, approximations, analogies, and rules of thumb when that distinction matters for understanding.",
      "Check understanding when doing so would materially improve subsequent teaching, especially before building on an important concept. Ask for the user's permission before using questions, exercises, or requests for explanation as assessment tools, and once permission is given, use them selectively rather than routinely after every explanation.",
      "If a writable workspace is available, create and maintain an internal Markdown progress file at `.colcoor/docs/<conversation_id>_syllabus.md` for the program. Use stable syllabus topic IDs and record the current status of each topic (not-started / in-progress / completed / needs-review), relevant evidence of progress, unresolved gaps, and important dependencies or decisions. Update it after meaningful learning or assessment events rather than after every message, and consult it when resuming or entering a topic. The file should support continuity across branches without replacing the visible syllabus or introducing hidden instructional rules.",
    ],
  },
  {
    id: "builtin:research",
    name: "Research",
    description: "Evidence-aware research with careful sourcing and uncertainty.",
    builtIn: true,
    notes: [
      "This is a research conversation.",
      "Conversation history is not evidence. A claim, assumption, interpretation, or hypothesis stated earlier in the conversation does not become established merely through repetition. Preserve its evidential status unless new support is introduced.",
      "If new information materially conflicts with an assumption, claim, or conclusion that is still active in the reasoning, point out the conflict and update the reasoning. Once a claim has been rejected or superseded, do not keep surfacing additional contradictions unless they are relevant to a new question or to understanding why it failed.",
      "Never invent, guess, or complete missing sources, bibliographic details, quotations, data, or reported findings. If a source or detail cannot be verified, say so.",
      "When a claim relies on a source, place a clear reference with the claim it supports and represent the source faithfully. Do not make a citation appear to support your own inference, or a stronger or broader claim than the source supports. Cite claims that would normally require support in academic work; do not add citations to routine background facts merely for appearance.",
      "Do not change the evidential assessment of a claim merely because the user states, prefers, or repeats it. Conversely, do not challenge the user's statements mechanically; raise an issue when it could materially affect the point being investigated.",
      "When assessing whether a nontrivial hypothesis or explanation is supported, consider materially plausible conflicting evidence, counterexamples, or alternative explanations rather than looking only for confirmation.",
      "Do not turn incomplete, conflicting, or weak evidence into a stronger conclusion than it supports. Express uncertainty when it materially affects the conclusion, without repeatedly restating the same qualification.",
      "When differences in source reliability or relevance could materially affect a conclusion, reflect those differences rather than treating the sources as equally informative.",
    ],
  },
];

function cleanString(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== "string") {
    throw new Error(`${field} must be a string.`);
  }
  const cleaned = value.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (!cleaned) {
    throw new Error(`${field} is required.`);
  }
  if (cleaned.length > maxLength) {
    throw new Error(`${field} must be at most ${maxLength} characters.`);
  }
  return cleaned;
}

export function validateEditableTemplate(value: unknown): EditableConversationTemplate {
  if (!value || typeof value !== "object") {
    throw new Error("Template must be an object.");
  }
  const row = value as Record<string, unknown>;
  const id = cleanString(row.id, "Template id", MAX_TEMPLATE_NAME_LENGTH);
  if (id.startsWith("builtin:")) {
    throw new Error("Custom template ids cannot use the builtin namespace.");
  }
  const name = cleanString(row.name, "Template name", MAX_TEMPLATE_NAME_LENGTH);
  const description =
    typeof row.description === "string"
      ? row.description.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim()
      : "";
  if (description.length > MAX_TEMPLATE_DESCRIPTION_LENGTH) {
    throw new Error(
      `Template description must be at most ${MAX_TEMPLATE_DESCRIPTION_LENGTH} characters.`,
    );
  }
  if (!Array.isArray(row.notes) || row.notes.length === 0) {
    throw new Error("A template must contain at least one note.");
  }
  if (row.notes.length > MAX_TEMPLATE_NOTES) {
    throw new Error(`A template may contain at most ${MAX_TEMPLATE_NOTES} notes.`);
  }
  const notes = row.notes.map((note, index) =>
    cleanString(note, `Note ${index + 1}`, MAX_TEMPLATE_NOTE_LENGTH),
  );
  return { id, name, description, notes };
}

export function builtInConversationTemplates(): ConversationTemplate[] {
  return BUILT_IN_TEMPLATES.map((template) => ({
    ...template,
    notes: [...template.notes],
  }));
}

export class ConversationTemplateRepository {
  private readonly filePath: string;

  constructor(globalStorageUri: vscode.Uri) {
    this.filePath = path.join(globalStorageUri.fsPath, "conversation-templates.v1.json");
  }

  async listCustom(): Promise<EditableConversationTemplate[]> {
    let raw: string;
    try {
      raw = await fs.readFile(this.filePath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return [];
      }
      throw error;
    }
    try {
      const file = JSON.parse(raw) as Partial<StoredTemplateFile>;
      if (file.version !== 1 || !Array.isArray(file.templates)) {
        throw new Error("unsupported format");
      }
      const templates = file.templates.map(validateEditableTemplate);
      const ids = new Set<string>();
      for (const template of templates) {
        if (ids.has(template.id)) {
          throw new Error(`Duplicate template id: ${template.id}`);
        }
        ids.add(template.id);
      }
      return templates;
    } catch {
      const backupPath = `${this.filePath}.invalid-${Date.now()}`;
      await fs.rename(this.filePath, backupPath);
      return [];
    }
  }

  async listAll(): Promise<ConversationTemplate[]> {
    const custom = await this.listCustom();
    return [
      ...builtInConversationTemplates(),
      ...custom.map((template) => ({ ...template, notes: [...template.notes], builtIn: false })),
    ];
  }

  async saveCustom(templates: readonly EditableConversationTemplate[]): Promise<void> {
    const validated = templates.map(validateEditableTemplate);
    const ids = new Set<string>();
    for (const template of validated) {
      if (ids.has(template.id)) {
        throw new Error(`Duplicate template id: ${template.id}`);
      }
      ids.add(template.id);
    }
    const payload: StoredTemplateFile = { version: 1, templates: validated };
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const tempPath = `${this.filePath}.${randomUUID()}.tmp`;
    await fs.writeFile(tempPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    await fs.rename(tempPath, this.filePath);
  }

  async upsert(template: EditableConversationTemplate): Promise<void> {
    const validated = validateEditableTemplate(template);
    const current = await this.listCustom();
    const index = current.findIndex((row) => row.id === validated.id);
    if (index >= 0) {
      current[index] = validated;
    } else {
      current.push(validated);
    }
    await this.saveCustom(current);
  }

  async createDraft(copy?: ConversationTemplate): Promise<EditableConversationTemplate> {
    return {
      id: `custom:${randomUUID()}`,
      name: copy ? `${copy.name} copy` : "New template",
      description: copy?.description ?? "",
      notes: copy ? [...copy.notes] : ["Add conversation guidance here."],
    };
  }

  async delete(id: string): Promise<void> {
    if (id.startsWith("builtin:")) {
      throw new Error("Built-in templates cannot be deleted.");
    }
    const current = await this.listCustom();
    await this.saveCustom(current.filter((template) => template.id !== id));
  }

  async importJson(raw: string): Promise<number> {
    const parsed = JSON.parse(raw) as unknown;
    const rows = Array.isArray(parsed)
      ? parsed
      : (parsed as Partial<StoredTemplateFile> | null)?.templates;
    if (!Array.isArray(rows)) {
      throw new Error("Import must be a template array or a versioned template file.");
    }
    const imported = rows.map((row) => {
      const source = row as Record<string, unknown>;
      return validateEditableTemplate({
        ...source,
        id:
          typeof source.id === "string" && !source.id.startsWith("builtin:")
            ? source.id
            : `custom:${randomUUID()}`,
      });
    });
    const current = await this.listCustom();
    const byId = new Map(current.map((row) => [row.id, row]));
    for (const row of imported) {
      byId.set(row.id, row);
    }
    await this.saveCustom([...byId.values()]);
    return imported.length;
  }

  async exportJson(): Promise<string> {
    const payload: StoredTemplateFile = { version: 1, templates: await this.listCustom() };
    return `${JSON.stringify(payload, null, 2)}\n`;
  }
}
