import { describe, expect, it } from "vitest";

import { builtInConversationTemplates } from "./conversationTemplates";
import { conversationTemplatePickerRows } from "./templatePickerModel";

describe("conversation template picker model", () => {
  it("puts No template first, templates in repository order, and management last", () => {
    const rows = conversationTemplatePickerRows(builtInConversationTemplates());
    expect(rows[0].kind).toBe("none");
    expect(rows.slice(1, -1).map((row) => row.label)).toEqual([
      "Learning / tutoring",
      "Structured learning program",
      "Research",
    ]);
    expect(rows.at(-1)?.kind).toBe("manage");
  });
});
