import { createHash } from "node:crypto";

import { normalizeSelectedText } from "./verifyListProposals";

export type MessageTextRangeAnchor = {
  version: 1;
  kind: "message_text_range";
  textStart: number;
  textEnd: number;
  exact: string;
  prefix: string;
  suffix: string;
  occurrenceIndex: number;
  messagePlainTextLength: number;
};

/** Build list-item anchor_json from verified offsets (extension-owned). */
export function buildListItemAnchor(
  bodyText: string,
  textStart: number,
  textEnd: number,
  occurrenceIndex: number,
): MessageTextRangeAnchor {
  const exact = bodyText.slice(textStart, textEnd);
  return {
    version: 1,
    kind: "message_text_range",
    textStart,
    textEnd,
    exact,
    prefix: bodyText.slice(Math.max(0, textStart - 80), textStart),
    suffix: bodyText.slice(textEnd, Math.min(bodyText.length, textEnd + 80)),
    occurrenceIndex,
    messagePlainTextLength: bodyText.length,
  };
}

/** Simple content hash matching webview `simpleHash` style (`h32:` + hex). */
export function sourceContentHash(bodyText: string): string {
  let h = 0;
  for (let i = 0; i < bodyText.length; i++) {
    h = (Math.imul(31, h) + bodyText.charCodeAt(i)) | 0;
  }
  return `h32:${(h >>> 0).toString(16)}`;
}

export function sha256Hex(bytes: string | Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function normalizeForListItem(selectedText: string): string {
  return normalizeSelectedText(selectedText);
}
