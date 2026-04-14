import { describe, expect, it } from "vitest";

import {
  TRANSCRIPT_STATIC_HEADER,
  buildAuthoritativeTranscript,
  escapeTranscriptBody,
} from "./buildTranscript";

describe("escapeTranscriptBody", () => {
  it("normalizes CRLF and lone CR to LF", () => {
    expect(escapeTranscriptBody("a\r\nb")).toBe("a\nb");
    expect(escapeTranscriptBody("x\ry")).toBe("x\ny");
  });

  it("escapes delimiter-like substrings so wrappers stay unambiguous", () => {
    expect(escapeTranscriptBody("<<<USER>>>")).toBe("<< <USER>>>");
    expect(escapeTranscriptBody("<<<NOTE>>>")).toBe("<< <NOTE>>>");
    expect(escapeTranscriptBody("x<<<END LLM>>>y")).toBe("x<< <END LLM>>>y");
  });
});

describe("buildAuthoritativeTranscript", () => {
  it("uses the literal title Conversation when title is missing or blank", () => {
    for (const conversationTitle of [null, undefined, "", "  \n"]) {
      const out = buildAuthoritativeTranscript({ conversationTitle, pathFromRoot: [] });
      expect(out.startsWith("Conversation\n")).toBe(true);
      expect(out).toContain(TRANSCRIPT_STATIC_HEADER);
    }
  });

  it("uses normalized non-empty title as first line (like rename PATCH)", () => {
    const out = buildAuthoritativeTranscript({
      conversationTitle: "  My chat  ",
      pathFromRoot: [],
    });
    expect(out.startsWith("My chat\n")).toBe(true);
    const out2 = buildAuthoritativeTranscript({
      conversationTitle: "  My\r\nChat\tthread  ",
      pathFromRoot: [],
    });
    expect(out2.startsWith("My Chat thread\n")).toBe(true);
  });

  it("serializes user and assistant blocks on the path", () => {
    const out = buildAuthoritativeTranscript({
      conversationTitle: "T",
      pathFromRoot: [
        { role: "user", content: "Q", notes: [] },
        { role: "assistant", content: "A", notes: [] },
      ],
    });
    expect(out).toContain("<<<USER>>>\nQ\n<<<END USER>>>");
    expect(out).toContain("<<<LLM>>>\nA\n<<<END LLM>>>");
  });

  it("does not duplicate final user when it matches the last path user content", () => {
    const path = [{ role: "user" as const, content: "Q", notes: [] }];
    const base = buildAuthoritativeTranscript({ conversationTitle: "T", pathFromRoot: path });
    const withSame = buildAuthoritativeTranscript({
      conversationTitle: "T",
      pathFromRoot: path,
      finalUserMessage: "Q",
    });
    expect(withSame).toBe(base);
    const withPadded = buildAuthoritativeTranscript({
      conversationTitle: "T",
      pathFromRoot: path,
      finalUserMessage: " Q\r\n",
    });
    expect(withPadded).toBe(base);
  });

  it("appends final user when it is new", () => {
    const path = [
      { role: "user" as const, content: "Q", notes: [] },
      { role: "assistant" as const, content: "A", notes: [] },
    ];
    const base = buildAuthoritativeTranscript({ conversationTitle: "T", pathFromRoot: path });
    const extended = buildAuthoritativeTranscript({
      conversationTitle: "T",
      pathFromRoot: path,
      finalUserMessage: "Follow up",
    });
    expect(extended.length).toBeGreaterThan(base.length);
    expect(extended.endsWith("<<<USER>>>\nFollow up\n<<<END USER>>>")).toBe(true);
    const extendedCrlf = buildAuthoritativeTranscript({
      conversationTitle: "T",
      pathFromRoot: path,
      finalUserMessage: "  Follow up\r\n",
    });
    expect(extendedCrlf.endsWith("<<<USER>>>\nFollow up\n<<<END USER>>>")).toBe(true);
  });

  it("emits NOTE blocks after each turn in createdAt order", () => {
    const out = buildAuthoritativeTranscript({
      conversationTitle: "T",
      pathFromRoot: [
        {
          role: "user",
          content: "Hi",
          notes: [
            { id: "b", createdAt: "2020-01-01T00:00:02Z", body: "second" },
            { id: "a", createdAt: "2020-01-01T00:00:01Z", body: "first" },
          ],
        },
      ],
    });
    const firstIdx = out.indexOf("<<<NOTE>>>\nfirst\n<<<END NOTE>>>");
    const secondIdx = out.indexOf("<<<NOTE>>>\nsecond\n<<<END NOTE>>>");
    expect(firstIdx).toBeGreaterThan(-1);
    expect(secondIdx).toBeGreaterThan(firstIdx);
  });
});
