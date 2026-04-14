import { describe, expect, it } from "vitest";

import { getAboutPanelHtml } from "./aboutPanelHtml";

describe("getAboutPanelHtml", () => {
  it("includes core product framing without implementation jargon", () => {
    const html = getAboutPanelHtml("");
    expect(html).toContain("<h1>About Colcoor</h1>");
    expect(html).toContain("branching conversations");
    expect(html).toContain("not a raw agent transcript");
  });

  it("mentions tree, resend, CLI setup, API key, settings, and command palette discoverability", () => {
    const html = getAboutPanelHtml("");
    expect(html).toContain("<strong>tree</strong>");
    expect(html).toContain("<strong>Resend assistant</strong>");
    expect(html).toContain("<strong>CLI setup</strong>");
    expect(html).toContain("<strong>Agent API key</strong>");
    expect(html).toContain("side chat");
    expect(html).toContain("drawers");
    expect(html).toContain("Command Palette");
    expect(html).toContain("<strong>Settings → Colcoor</strong>");
  });

  it("inlines the policy fragment from the host", () => {
    const fragment = '<h2 class="muted">Policies</h2><ul><li><a href="https://x.test/t">Terms</a></li></ul>';
    const html = getAboutPanelHtml(fragment);
    expect(html).toContain(fragment);
    expect(html).toContain('href="https://x.test/t"');
  });
});
