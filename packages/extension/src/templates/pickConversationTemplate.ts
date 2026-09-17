import * as vscode from "vscode";

import type {
  ConversationTemplate,
  ConversationTemplateRepository,
} from "./conversationTemplates";
import { conversationTemplatePickerRows } from "./templatePickerModel";

type TemplatePick = vscode.QuickPickItem & {
  value: ConversationTemplate | null | "manage";
};

export async function pickConversationTemplate(
  repository: ConversationTemplateRepository,
  title: string,
): Promise<ConversationTemplate | null | undefined> {
  const templates = await repository.listAll();
  const items: TemplatePick[] = conversationTemplatePickerRows(templates).map((row) => ({
    label: row.label,
    description: row.description,
    detail:
      row.kind === "template"
        ? row.template.builtIn
          ? "Built-in"
          : "Custom template on this device"
        : undefined,
    value: row.kind === "none" ? null : row.kind === "manage" ? "manage" : row.template,
  }));
  const picked = await vscode.window.showQuickPick(items, {
    title,
    placeHolder: "Choose a conversation template or continue without one",
    matchOnDescription: true,
    matchOnDetail: true,
    ignoreFocusOut: true,
  });
  if (!picked) return undefined;
  if (picked.value === "manage") {
    await vscode.commands.executeCommand("colcoor.manageConversationTemplates");
    return undefined;
  }
  return picked.value;
}
