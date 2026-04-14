import { describe, expect, it } from "vitest";

import { getAboutPanelHtml } from "./aboutPanelHtml";

describe("getAboutPanelHtml", () => {
  it("includes core product framing without implementation jargon", () => {
    const html = getAboutPanelHtml("");
    expect(html).toContain("<h1>About Colcoor</h1>");
    expect(html).toContain("branching conversations");
    expect(html).toContain("not a raw backstage log");
  });

  it("mentions branch view, resend, side chat, drawers, setup, milestone label, settings, and command palette", () => {
    const html = getAboutPanelHtml("");
    expect(html).toContain("<strong>branch view</strong>");
    expect(html).toContain("<strong>Resend assistant</strong>");
    expect(html).toContain("<strong>Side chat</strong>");
    expect(html).toContain("drawers");
    expect(html).toContain("<strong>setup buttons</strong>");
    expect(html).toContain("<strong>milestone label</strong>");
    expect(html).toContain("Command Palette");
    expect(html).toContain("<strong>Settings → Colcoor</strong>");
  });

  it("points to legal policy URL settings ([ui-features.md] §1.3)", () => {
    const html = getAboutPanelHtml("");
    expect(html).toContain("Open legal policy settings");
    expect(html).toContain("<strong>Terms</strong>");
    expect(html).toContain("<strong>Privacy</strong>");
    expect(html).toContain("<strong>Refund</strong>");
  });

  it("avoids repository or API jargon in the footer line ([ui-features.md] §2)", () => {
    const html = getAboutPanelHtml("");
    expect(html).toContain("Policy links may appear");
    expect(html).not.toContain("domain model");
    expect(html).not.toContain("API");
  });

  it("inlines the policy fragment from the host", () => {
    const fragment = '<h2 class="muted">Policies</h2><ul><li><a href="https://x.test/t">Terms</a></li></ul>';
    const html = getAboutPanelHtml(fragment);
    expect(html).toContain(fragment);
    expect(html).toContain('href="https://x.test/t"');
  });
});
