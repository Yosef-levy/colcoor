import { describe, expect, it } from "vitest";

import {
  mergeAgentDisplayPartsAcrossResume,
  mergeAgentStdoutAcrossResume,
} from "./cursorCliStdoutMerge";

describe("mergeAgentStdoutAcrossResume", () => {
  it("returns the non-empty side when one is blank", () => {
    expect(mergeAgentStdoutAcrossResume("", "hello")).toBe("hello");
    expect(mergeAgentStdoutAcrossResume("hello", "")).toBe("hello");
  });

  it("prefers the superset when the resume stream repeats the prefix", () => {
    expect(mergeAgentStdoutAcrossResume("Hello", "Hello world")).toBe("Hello world");
  });

  it("joins distinct pre- and post-approval assistant text", () => {
    expect(mergeAgentStdoutAcrossResume("Before approval", "After approval")).toBe(
      "Before approval\n\nAfter approval",
    );
  });
});

describe("mergeAgentDisplayPartsAcrossResume", () => {
  it("concatenates display parts across resume sessions", () => {
    expect(
      mergeAgentDisplayPartsAcrossResume(
        [{ kind: "assistant", text: "A" }],
        [{ kind: "assistant", text: "B" }],
      ),
    ).toEqual([
      { kind: "assistant", text: "A" },
      { kind: "assistant", text: "B" },
    ]);
  });
});
