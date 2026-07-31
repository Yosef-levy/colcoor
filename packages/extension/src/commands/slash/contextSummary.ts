import type { GraphEventNode } from "../../api/client";
import {
  readConversationContextSavingsAggregate,
  type ConversationContextSavingsAggregate,
} from "../../conversation/contextSavings";
import { readColcoorProviderUsage } from "../../conversation/messageProviderUsage";
import type { CursorCliMode } from "../../agent/cursorCliMode";
import type { ProviderId } from "../../agent/providers/types";
import type { ProviderSlashCapabilities } from "./types";

export function buildColcoorContextSummaryLines(params: {
  conversationId: string;
  providerId: ProviderId;
  cliMode: CursorCliMode;
  selectedModel: string;
  capabilities: ProviderSlashCapabilities;
  events: GraphEventNode[];
  conversationMetadataJson?: Record<string, unknown> | null;
}): string[] {
  const lines: string[] = [
    `- Conversation: \`${params.conversationId}\``,
    `- Provider: \`${params.providerId}\``,
    `- Mode: \`${params.cliMode}\``,
    `- Model: \`${params.selectedModel || "auto"}\``,
    `- Events on branch graph: **${params.events.length}**`,
  ];

  const savings = readConversationContextSavingsAggregate(params.conversationMetadataJson) ?? null;
  if (savings) {
    lines.push("", "**Context savings (Colcoor estimator)**", ...formatSavings(savings));
  } else {
    lines.push("", "_No Colcoor context-savings aggregate yet._");
  }

  const lastUsage = findLatestProviderUsage(params.events);
  if (lastUsage) {
    lines.push(
      "",
      "**Last provider usage**",
      `- Backend: \`${lastUsage.backend}\``,
      `- Model: \`${lastUsage.model}\``,
      `- Tokens in/out: **${lastUsage.tokens.input}** / **${lastUsage.tokens.output}**`,
    );
    if (lastUsage.tokens.cache_read != null) {
      lines.push(`- Cache read: **${lastUsage.tokens.cache_read}**`);
    }
    if (lastUsage.cost_usd != null) {
      lines.push(`- Cost: **$${lastUsage.cost_usd.toFixed(4)}**`);
    }
  }

  if (params.capabilities.supportsProviderContext) {
    lines.push(
      "",
      "_Claude Agent SDK also exposes a live `/context` command (provider-native) during Plan/Agent sessions._",
    );
  }

  return lines;
}

function formatSavings(s: ConversationContextSavingsAggregate): string[] {
  return [
    `- Generations counted: **${s.counted_generations}**`,
    `- Current linear context tokens: **${s.current_linear_context_tokens}**`,
    `- Total linear / actual: **${s.total_linear_context_tokens}** / **${s.total_actual_context_tokens}**`,
    `- Tokens saved: **${s.total_tokens_saved}** (${s.percent_saved}%)`,
  ];
}

function findLatestProviderUsage(events: GraphEventNode[]) {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (!e || e.kind !== "assistant_output") {
      continue;
    }
    const usage = readColcoorProviderUsage(e.content_json ?? undefined);
    if (usage) {
      return usage;
    }
  }
  return undefined;
}
