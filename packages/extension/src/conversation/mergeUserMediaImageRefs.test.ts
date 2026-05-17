import { describe, expect, it } from "vitest";
import { mergeUserMediaImageRefs } from "./mergeUserMediaImageRefs";

describe("mergeUserMediaImageRefs", () => {
  it("dedupes by id with existing refs first", () => {
    const existing = [{ id: "a", mime_type: "image/png", byte_size: 1 }];
    const uploaded = [
      { id: "a", mime_type: "image/png", byte_size: 2 },
      { id: "b", mime_type: "image/jpeg", byte_size: 3 },
    ];
    expect(mergeUserMediaImageRefs(existing, uploaded)).toEqual([
      { id: "a", mime_type: "image/png", byte_size: 1 },
      { id: "b", mime_type: "image/jpeg", byte_size: 3 },
    ]);
  });
});
