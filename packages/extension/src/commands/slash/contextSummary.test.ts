import { describe, expect, it } from "vitest";

import { buildColcoorContextSummaryLines } from "./contextSummary";
import type { GraphEventNode } from "../../api/client";

function event(partial: Partial<GraphEventNode> & { id: string; kind: string }): GraphEventNode {
  return {
    conversation_id: "c1",
    parent_event_id: null,
    actor_type: "user",
    actor_user_id: null,
    content_text: "",
    visible_to: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

describe("buildColcoorContextSummaryLines", () => {
  it("includes provider/mode and latest usage", () => {
    const lines = buildColcoorContextSummaryLines({
      conversationId: "c1",
      providerId: "anthropic",
      cliMode: "ask",
      selectedModel: "auto",
      capabilities: {
        supportsProviderCommands: false,
        supportsSkills: false,
        supportsProviderContext: false,
        supportsDisallowedTools: false,
      },
      events: [
        event({
          id: "a1",
          kind: "assistant_output",
          content_json: {
            colcoor_provider_usage: {
              version: 1,
              provider: "anthropic",
              backend: "messages_api",
              mode: "ask",
              model: "claude-test",
              tokens: { input: 10, output: 20 },
              captured_at: "2026-01-01T00:00:00.000Z",
            },
          },
        }),
      ],
    });
    expect(lines.join("\n")).toContain("anthropic");
    expect(lines.join("\n")).toContain("Last provider usage");
    expect(lines.join("\n")).toContain("10");
  });
});
