import { describe, expect, it } from "vitest";

import { getAboutPanelHtml } from "./aboutPanelHtml";

describe("getAboutPanelHtml", () => {
  it("includes core product framing without implementation jargon", () => {
    const html = getAboutPanelHtml();
    expect(html).toContain("<h1>Colcoor — Help</h1>");
    expect(html).toContain("branching conversations");
    expect(html).toContain("not a play-by-play technical log");
  });

  it("covers outline, resend, side chat, mentions, sounds, invite, titles, search, and extension settings", () => {
    const html = getAboutPanelHtml();
    expect(html).toContain("<strong>conversation outline</strong>");
    expect(html).toContain("<strong>Resend assistant</strong>");
    expect(html).toContain("<strong>Side chat</strong>");
    expect(html).toContain("<strong>View → Open side chat</strong>");
    expect(html).toContain("type <strong>@</strong>");
    expect(html).toContain("<strong>@all</strong>");
    expect(html).toContain("<strong>Side chat sounds…</strong>");
    expect(html).toContain("Colcoor: Open side chat sound &amp; notification settings…");
    expect(html).toContain("<strong>Invite teammates</strong>");
    expect(html).toContain("<strong>Conversation → Add member…</strong>");
    expect(html).toContain("<strong>Colcoor: Add member…</strong>");
    expect(html).toContain("<strong>@handle</strong>");
    expect(html).toContain("<strong>Conversation → Members</strong>");
    expect(html).toContain("<strong>message titles</strong>");
    expect(html).toContain("<strong>Message → Add/edit title…</strong>");
    expect(html).toContain("<strong>View → Search…</strong>");
    expect(html).toContain("<strong>Settings → Extensions → Colcoor</strong>");
    expect(html).toContain("Command Palette");
    expect(html).not.toContain("drawers");
    expect(html).not.toContain("Copy ID");
    expect(html).not.toContain("Open legal policy");
    expect(html).not.toContain("Policy links may appear");
  });

  it("avoids repository or API jargon in user-facing copy ([ui-features.md] §2)", () => {
    const html = getAboutPanelHtml();
    expect(html).not.toContain("domain model");
    expect(html).not.toContain("API");
  });

  it("avoids older informal engineering phrases in the main copy ([ui-features.md] §2)", () => {
    const html = getAboutPanelHtml();
    expect(html).not.toContain("branch view");
    expect(html).not.toContain("backstage");
    expect(html).not.toContain("local agent");
  });
});
