import { describe, expect, it } from "vitest";

import {
  assistantDisplayModelFromEvent,
  buildColcoorAgentMeta,
  formatAssistantRoleLabel,
  mergeAssistantContentJson,
  readColcoorAgentMeta,
  resolveAgentModelShortLabel,
} from "./agentModelDisplay";

describe("agentModelDisplay", () => {
  const catalog = {
    curated: [{ id: "gpt-5.5-medium", label: "GPT-5.5 1M" }],
    all: [
      { id: "gpt-5.5-medium", label: "GPT-5.5 1M" },
      { id: "composer-2-fast", label: "Composer 2 Fast (current, default)" },
    ],
    hint: null,
  };

  it("reads and builds colcoor_agent_meta", () => {
    const meta = buildColcoorAgentMeta("gpt-5.5-medium", "GPT-5.5 1M");
    expect(readColcoorAgentMeta(meta)).toEqual({
      model_id: "gpt-5.5-medium",
      model_label: "GPT-5.5 1M",
    });
  });

  it("merges trace and meta content_json", () => {
    const cj = mergeAssistantContentJson(
      { colcoor_agent_trace: { version: 2, entries: [] } },
      buildColcoorAgentMeta("gpt-5.5-medium", "GPT-5.5 1M"),
    );
    expect(cj?.colcoor_agent_trace).toBeTruthy();
    expect(cj?.colcoor_agent_meta).toBeTruthy();
  });

  it("formats assistant role like user parentheses", () => {
    expect(formatAssistantRoleLabel("GPT-5.5 1M")).toBe("Assistant (GPT-5.5 1M)");
    expect(formatAssistantRoleLabel(undefined)).toBe("Assistant");
  });

  it("resolves Auto and catalog labels", () => {
    expect(resolveAgentModelShortLabel("auto", catalog)).toBe("Auto");
    expect(resolveAgentModelShortLabel("composer-2-fast", catalog)).toBe("Composer 2 Fast");
  });

  it("reads display model from persisted content_json", () => {
    const label = assistantDisplayModelFromEvent(
      buildColcoorAgentMeta("gpt-5.5-medium", "GPT-5.5 1M"),
      catalog,
    );
    expect(label).toBe("GPT-5.5 1M");
  });
});
