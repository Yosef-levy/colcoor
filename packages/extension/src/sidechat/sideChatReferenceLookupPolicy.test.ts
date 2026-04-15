import { describe, expect, it } from "vitest";

import type { SideChatMessageOut } from "../api/client";
import {
  needsReferenceLookupRefresh,
  sideChatMessageHasUnknownReferenceLookups,
} from "./sideChatReferenceLookupPolicy";

function msg(
  seq: number,
  refs: Partial<Pick<SideChatMessageOut, "referenced_event_id" | "referenced_note_id">>,
): Pick<SideChatMessageOut, "seq" | "referenced_event_id" | "referenced_note_id"> {
  return {
    seq,
    referenced_event_id: refs.referenced_event_id ?? null,
    referenced_note_id: refs.referenced_note_id ?? null,
  };
}

describe("sideChatMessageHasUnknownReferenceLookups", () => {
  it("is false when there are no references", () => {
    expect(sideChatMessageHasUnknownReferenceLookups(msg(1, {}), {}, {})).toBe(false);
  });

  it("is true when referenced event is missing from the map", () => {
    expect(sideChatMessageHasUnknownReferenceLookups(msg(1, { referenced_event_id: "e1" }), {}, {})).toBe(
      true,
    );
  });

  it("is false when referenced ids exist in maps", () => {
    expect(
      sideChatMessageHasUnknownReferenceLookups(
        msg(1, { referenced_event_id: "e1", referenced_note_id: "n1" }),
        { e1: "x" },
        { n1: "y" },
      ),
    ).toBe(false);
  });
});

describe("needsReferenceLookupRefresh", () => {
  it("returns false when there are no messages", () => {
    expect(needsReferenceLookupRefresh([], 0, {}, {})).toBe(false);
  });

  it("returns false when newer-than-boundary messages have no references", () => {
    const messages = [msg(3, {}), msg(2, {}), msg(1, {})];
    expect(needsReferenceLookupRefresh(messages, 0, {}, {})).toBe(false);
  });

  it("returns false when all referenced ids in the new range exist in maps", () => {
    const messages = [
      msg(5, { referenced_event_id: "e1" }),
      msg(4, { referenced_note_id: "n1" }),
    ];
    expect(
      needsReferenceLookupRefresh(messages, 3, { e1: "hi" }, { n1: "note" }),
    ).toBe(false);
  });

  it("returns true when a referenced event id in the new range is missing", () => {
    const messages = [msg(10, { referenced_event_id: "missing" })];
    expect(needsReferenceLookupRefresh(messages, 9, {}, {})).toBe(true);
  });

  it("returns true when a referenced note id in the new range is missing", () => {
    const messages = [msg(2, { referenced_note_id: "n-x" })];
    expect(needsReferenceLookupRefresh(messages, 1, {}, {})).toBe(true);
  });

  it("does not scan messages at or below readThroughSeq (stale missing ref in old tail)", () => {
    const messages = [
      msg(10, {}),
      msg(2, { referenced_event_id: "e-missing" }),
    ];
    expect(needsReferenceLookupRefresh(messages, 5, {}, {})).toBe(false);
  });

  it("short-circuits on newest row (missing ref first in desc order)", () => {
    const messages = [
      msg(100, { referenced_event_id: "need" }),
      msg(99, { referenced_event_id: "other" }),
    ];
    expect(needsReferenceLookupRefresh(messages, 0, { other: "ok" }, {})).toBe(true);
  });

  it("treats readThroughSeq -1 as no boundary (still scans all seq until break)", () => {
    const messages = [msg(1, { referenced_event_id: "e1" })];
    expect(needsReferenceLookupRefresh(messages, -1, { e1: "x" }, {})).toBe(false);
    expect(needsReferenceLookupRefresh(messages, -1, {}, {})).toBe(true);
  });
});
