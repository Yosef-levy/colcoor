import { describe, expect, it } from "vitest";

import { getTemplateManagerPanelHtml } from "./templateManagerPanelHtml";

describe("template manager webview", () => {
  it("provides custom-template CRUD, ordering, and portable JSON actions", () => {
    const html = getTemplateManagerPanelHtml("vscode-resource://test", "nonce");
    expect(html).toContain('id="newTemplate"');
    expect(html).toContain('id="duplicateTemplate"');
    expect(html).toContain('id="saveTemplate"');
    expect(html).toContain('id="deleteTemplate"');
    expect(html).toContain('id="addNote"');
    expect(html).toContain('id="importTemplates"');
    expect(html).toContain('id="exportTemplates"');
    expect(html).toContain('script-src \'nonce-nonce\'');
  });
});
