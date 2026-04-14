import { describe, expect, it } from "vitest";

import { normalizePersistedUserInputText } from "./normalizeUserInputText";

describe("normalizePersistedUserInputText", () => {
  it("trims ASCII whitespace", () => {
    expect(normalizePersistedUserInputText("  a  ")).toBe("a");
  });

  it("converts CRLF and lone CR to LF before trim", () => {
    expect(normalizePersistedUserInputText("a\r\nb")).toBe("a\nb");
    expect(normalizePersistedUserInputText("x\ry")).toBe("x\ny");
  });

  it("returns empty string when only newlines or spaces remain", () => {
    expect(normalizePersistedUserInputText("\r\n  \n")).toBe("");
  });
});
