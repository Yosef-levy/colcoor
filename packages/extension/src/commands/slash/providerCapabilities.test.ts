import { describe, expect, it } from "vitest";

import { resolveProviderSlashCapabilities } from "./providerCapabilities";

describe("resolveProviderSlashCapabilities", () => {
  it("disables provider commands for Anthropic Ask", () => {
    expect(
      resolveProviderSlashCapabilities({
        providerId: "anthropic",
        cliMode: "ask",
        agentMode: "auto",
      }),
    ).toMatchObject({
      supportsProviderCommands: false,
      supportsSkills: false,
    });
  });

  it("enables provider commands for Anthropic Plan/Agent", () => {
    for (const cliMode of ["plan", "agent"] as const) {
      expect(
        resolveProviderSlashCapabilities({
          providerId: "anthropic",
          cliMode,
          agentMode: "auto",
        }),
      ).toMatchObject({
        supportsProviderCommands: true,
        supportsSkills: true,
        supportsProviderContext: true,
        supportsDisallowedTools: true,
      });
    }
  });

  it("disables provider commands for Cursor CLI", () => {
    expect(
      resolveProviderSlashCapabilities({
        providerId: "cursor",
        cliMode: "agent",
        agentMode: "auto",
      }),
    ).toMatchObject({
      supportsProviderCommands: false,
      supportsSkills: false,
    });
  });

  it("disables everything in stub mode", () => {
    expect(
      resolveProviderSlashCapabilities({
        providerId: "anthropic",
        cliMode: "agent",
        agentMode: "stub",
      }).supportsProviderCommands,
    ).toBe(false);
  });
});
