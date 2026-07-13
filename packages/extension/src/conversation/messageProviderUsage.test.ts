import { describe, expect, it } from "vitest";
import { computeCacheHitPercent } from "./messageMetadataCore";
import {
  finalizeProviderUsage,
  providerUsageFromAnthropicMessage,
  providerUsageFromSdkResult,
  readColcoorProviderUsage,
  sumAnthropicUsageTokens,
} from "./messageProviderUsage";

describe("messageProviderUsage", () => {
  it("maps Anthropic Messages API usage to colcoor_provider_usage", () => {
    const usage = providerUsageFromAnthropicMessage(
      {
        id: "msg_abc",
        model: "claude-sonnet-4-5",
        stop_reason: "end_turn",
        usage: {
          input_tokens: 1200,
          output_tokens: 300,
          cache_read_input_tokens: 8000,
          cache_creation_input_tokens: 400,
          cache_creation: {
            ephemeral_5m_input_tokens: 100,
            ephemeral_1h_input_tokens: 300,
          },
          output_tokens_details: { thinking_tokens: 50 },
          inference_geo: null,
          server_tool_use: null,
          service_tier: "standard",
        },
      },
      { mode: "ask", promptCacheTtl: "1h", durationMs: 2500 },
    );
    expect(usage.backend).toBe("messages_api");
    expect(usage.mode).toBe("ask");
    expect(usage.message_id).toBe("msg_abc");
    expect(usage.tokens).toMatchObject({
      input: 1200,
      output: 300,
      cache_read: 8000,
      cache_creation: 400,
      cache_creation_5m: 100,
      cache_creation_1h: 300,
      thinking: 50,
    });
    expect(readColcoorProviderUsage({ colcoor_provider_usage: usage })).toEqual(usage);
  });

  it("sums Anthropic usage across tool-loop rounds", () => {
    const summed = sumAnthropicUsageTokens([
      {
        input_tokens: 10,
        output_tokens: 2,
        cache_read_input_tokens: 100,
        cache_creation_input_tokens: 0,
        cache_creation: null,
        output_tokens_details: null,
        inference_geo: null,
        server_tool_use: null,
        service_tier: "standard",
      },
      {
        input_tokens: 20,
        output_tokens: 5,
        cache_read_input_tokens: 50,
        cache_creation_input_tokens: 3,
        cache_creation: { ephemeral_5m_input_tokens: 3, ephemeral_1h_input_tokens: 0 },
        output_tokens_details: { thinking_tokens: 1 },
        inference_geo: null,
        server_tool_use: null,
        service_tier: "standard",
      },
    ]);
    expect(summed).toMatchObject({
      input: 30,
      output: 7,
      cache_read: 150,
      cache_creation: 3,
      cache_creation_5m: 3,
      thinking: 1,
    });
  });

  it("maps Claude Agent SDK result usage", () => {
    const usage = providerUsageFromSdkResult(
      {
        uuid: "turn-uuid",
        total_cost_usd: 0.042,
        duration_ms: 12000,
        duration_api_ms: 9000,
        num_turns: 3,
        stop_reason: "end_turn",
        permission_denials: [{}, {}],
        usage: {
          input_tokens: 500,
          output_tokens: 200,
          cache_read_input_tokens: 1000,
          cache_creation_input_tokens: 0,
        },
      },
      { mode: "agent", model: "claude-sonnet-4-5", continuation: "fork" },
    );
    expect(usage.backend).toBe("claude_agent_sdk");
    expect(usage.cost_usd).toBe(0.042);
    expect(usage.num_turns).toBe(3);
    expect(usage.permission_denials).toBe(2);
    expect(usage.continuation).toBe("fork");
  });

  it("finalizes mode and continuation from turn context", () => {
    const base = providerUsageFromSdkResult(
      { usage: { input_tokens: 1, output_tokens: 2 } },
      { mode: "agent", model: "m" },
    );
    const merged = finalizeProviderUsage(base, {
      cliMode: "plan",
      agentSession: { kind: "resume", sessionId: "sess" },
      promptCacheTtl: "5m",
    });
    expect(merged?.mode).toBe("plan");
    expect(merged?.continuation).toBe("resume");
    expect(merged?.prompt_cache_ttl).toBe("5m");
  });

  it("computes cache hit percent from token buckets", () => {
    expect(
      computeCacheHitPercent({ input: 100, output: 0, cache_read: 900, cache_creation: 0 }),
    ).toBe(90);
    expect(computeCacheHitPercent({ input: 0, output: 0 })).toBeNull();
  });
});
