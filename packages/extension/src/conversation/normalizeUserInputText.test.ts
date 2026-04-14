import { describe, expect, it } from "vitest";

import {
  normalizeOptionalGraphEventId,
  normalizePersistedUserInputText,
} from "./normalizeUserInputText";

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

  it("preserves inner blank lines after CRLF normalize (notes, copy-thread)", () => {
    expect(normalizePersistedUserInputText("  a\r\n\r\nb  ")).toBe("a\n\nb");
  });
});

describe("normalizeOptionalGraphEventId", () => {
  it("returns undefined for undefined, empty, and whitespace-only input", () => {
    expect(normalizeOptionalGraphEventId(undefined)).toBeUndefined();
    expect(normalizeOptionalGraphEventId("")).toBeUndefined();
    expect(normalizeOptionalGraphEventId("  \r\n\t  ")).toBeUndefined();
  });

  it("trims and normalizes line endings like persisted user text", () => {
    expect(normalizeOptionalGraphEventId("  uuid-here\r\n")).toBe("uuid-here");
    expect(normalizeOptionalGraphEventId("a\rb")).toBe("a\nb");
  });
});
