import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { getConversationWebviewHtml } from "../../conversation/conversationWebviewHtml";

describe("slash command UI wiring", () => {
  it("embeds composer slash picker, discovery button, and keyboard handling", () => {
    const html = getConversationWebviewHtml("vscode-resource://test", "nonceSlash");
    expect(html).toContain('id="composerSlashPicker"');
    expect(html).toContain('id="btnSlashCommands"');
    expect(html).toContain('id="slashCommandResult"');
    expect(html).toContain("updateComposerSlashPicker");
    expect(html).toContain("applyComposerSlashPick");
    expect(html).toContain('e.key === "Escape"');
    expect(html).toContain('e.key === "ArrowDown"');
    expect(html).toContain("dismissSlashResult");
    expect(html).toContain("slashCommands");
  });

  it("wires host dispatch before runColcoorUserTurn and uses /colcoor- prefix", () => {
    const source = readFileSync(resolve(__dirname, "../../conversation/conversationPanel.ts"), "utf8");
    expect(source).toContain("dispatchSlashCommand");
    expect(source).toContain("applySlashCommandResult");
    expect(source).toContain("slashCommands: slashCommandCatalogForWebview()");
    expect(source).toContain("providerSlashCommand");
    expect(source).toContain("onProviderCommandsChanged");
  });

  it("keeps Claude Agent SDK Query surface for supportedCommands and skills", () => {
    const source = readFileSync(
      resolve(__dirname, "../../agent/providers/claudeAgentProvider.ts"),
      "utf8",
    );
    expect(source).toContain("supportedCommands");
    expect(source).toContain('skills: "all"');
    expect(source).toContain("commands_changed");
    expect(source).toContain("updateProviderCommandCatalogFromSdk");
    expect(source).toContain("providerSlashCommand");
  });
});
