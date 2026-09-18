import type { ConversationTemplate } from "./conversationTemplates";

export type ConversationTemplatePickerRow =
  | { kind: "none"; label: string; description: string }
  | { kind: "template"; label: string; description: string; template: ConversationTemplate }
  | { kind: "manage"; label: string; description: string };

export function conversationTemplatePickerRows(
  templates: readonly ConversationTemplate[],
): ConversationTemplatePickerRow[] {
  return [
    {
      kind: "none",
      label: "$(circle-slash) No template",
      description: "Start without predefined root notes",
    },
    ...templates.map(
      (template): ConversationTemplatePickerRow => ({
        kind: "template",
        label: template.name,
        description: template.description,
        template,
      }),
    ),
    {
      kind: "manage",
      label: "$(settings-gear) Manage templates…",
      description: "Create, edit, import, or export templates",
    },
  ];
}
