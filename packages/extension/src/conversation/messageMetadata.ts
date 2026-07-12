import type { GraphEventNode } from "../api/client";
import {
  computeCacheHitPercent,
  formatCompactNumber,
  formatMessageMetadataHtml,
  hasDisplayableMetadata,
  messageMetadataWebviewScriptBlock,
  readMessageMetadata,
  type MessageMetadataEvent,
  type MessageMetadataViewModel,
  type MetadataRow,
  type MetadataSection,
} from "./messageMetadataCore";
import type { ColcoorProviderUsageTokens } from "./messageProviderUsage";

export type { MessageMetadataViewModel, MetadataRow, MetadataSection, MessageMetadataEvent };
export {
  computeCacheHitPercent,
  formatCompactNumber,
  formatMessageMetadataHtml,
  hasDisplayableMetadata,
  messageMetadataWebviewScriptBlock,
  readMessageMetadata,
};

/** Host/tests adapter: {@link GraphEventNode} → metadata view model. */
export function readGraphEventMetadata(event: GraphEventNode): MessageMetadataViewModel | null {
  return readMessageMetadata(event as MessageMetadataEvent);
}

export function computeCacheHitFromUsageTokens(tokens: ColcoorProviderUsageTokens): number | null {
  return computeCacheHitPercent(tokens);
}
