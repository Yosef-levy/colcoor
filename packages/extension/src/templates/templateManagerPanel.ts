import { randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import * as vscode from "vscode";

import {
  ConversationTemplateRepository,
  type EditableConversationTemplate,
} from "./conversationTemplates";
import { getTemplateManagerPanelHtml } from "./templateManagerPanelHtml";

export type TemplateManagerPanelController = {
  show: () => void;
  dispose: () => void;
};

export function createTemplateManagerPanelController(
  context: vscode.ExtensionContext,
  repository: ConversationTemplateRepository,
): TemplateManagerPanelController {
  let panel: vscode.WebviewPanel | undefined;
  let transientDraft: EditableConversationTemplate | undefined;

  async function postTemplates(selectedId?: string): Promise<void> {
    if (!panel) return;
    try {
      const templates = await repository.listAll();
      if (transientDraft && !templates.some((row) => row.id === transientDraft?.id)) {
        templates.push({ ...transientDraft, notes: [...transientDraft.notes], builtIn: false });
      }
      await panel.webview.postMessage({
        type: "templates",
        templates,
        selectedId,
      });
    } catch (error) {
      await panel.webview.postMessage({
        type: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async function handleMessage(message: unknown): Promise<void> {
    const row = message as {
      type?: string;
      id?: string;
      template?: EditableConversationTemplate;
    };
    try {
      if (row.type === "ready") {
        await postTemplates();
        return;
      }
      if (row.type === "save" && row.template) {
        await repository.upsert(row.template);
        transientDraft = undefined;
        await postTemplates(row.template.id);
        void vscode.window.showInformationMessage("Colcoor: conversation template saved.");
        return;
      }
      if (row.type === "new") {
        transientDraft = await repository.createDraft();
        await postTemplates(transientDraft.id);
        return;
      }
      if (row.type === "duplicate" && row.id) {
        const source = (await repository.listAll()).find((template) => template.id === row.id);
        if (!source) throw new Error("Template not found.");
        transientDraft = await repository.createDraft(source);
        await postTemplates(transientDraft.id);
        return;
      }
      if (row.type === "delete" && row.id) {
        if (transientDraft?.id === row.id) {
          transientDraft = undefined;
          await postTemplates();
          return;
        }
        const answer = await vscode.window.showWarningMessage(
          "Delete this custom conversation template?",
          { modal: true },
          "Delete",
        );
        if (answer !== "Delete") return;
        await repository.delete(row.id);
        await postTemplates();
        return;
      }
      if (row.type === "import") {
        const picks = await vscode.window.showOpenDialog({
          canSelectMany: false,
          filters: { JSON: ["json"] },
          openLabel: "Import conversation templates",
        });
        if (!picks?.[0]) return;
        const count = await repository.importJson(await fs.readFile(picks[0].fsPath, "utf8"));
        await postTemplates();
        void vscode.window.showInformationMessage(`Colcoor: imported ${count} template(s).`);
        return;
      }
      if (row.type === "export") {
        const target = await vscode.window.showSaveDialog({
          defaultUri: vscode.Uri.file("colcoor-conversation-templates.json"),
          filters: { JSON: ["json"] },
          saveLabel: "Export conversation templates",
        });
        if (!target) return;
        await fs.writeFile(target.fsPath, await repository.exportJson(), "utf8");
        void vscode.window.showInformationMessage("Colcoor: conversation templates exported.");
      }
    } catch (error) {
      await panel?.webview.postMessage({
        type: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  function show(): void {
    if (panel) {
      panel.reveal(vscode.ViewColumn.Active);
      return;
    }
    panel = vscode.window.createWebviewPanel(
      "colcoor.conversationTemplates",
      "Colcoor — Conversation templates",
      vscode.ViewColumn.Active,
      { enableScripts: true, retainContextWhenHidden: true },
    );
    const nonce = randomBytes(16).toString("hex");
    panel.webview.onDidReceiveMessage(handleMessage);
    panel.onDidDispose(() => {
      panel = undefined;
      transientDraft = undefined;
    });
    panel.webview.html = getTemplateManagerPanelHtml(panel.webview.cspSource, nonce);
  }

  return {
    show,
    dispose: () => panel?.dispose(),
  };
}
