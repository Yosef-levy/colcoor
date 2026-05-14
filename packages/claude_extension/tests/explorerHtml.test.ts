import { describe, expect, it } from "vitest";

import { COLCOOR_CONVERSATION_EXPLORER_URI } from "../src/mcpApp/constants.js";
import { getConversationExplorerHtml } from "../src/mcpApp/explorerHtml.js";

describe("getConversationExplorerHtml", () => {
  it("returns a valid MCP App HTML shell with embedded boot script", () => {
    const html = getConversationExplorerHtml();
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("ui/initialize");
    expect(html).toContain("colcoor_set_active_event");
    expect(html).not.toContain(COLCOOR_CONVERSATION_EXPLORER_URI);
  });
});
