import { describe, expect, it } from "vitest";

import { stripAnsiSgr } from "./stripAnsi";

describe("stripAnsiSgr", () => {
  it("returns empty for empty input", () => {
    expect(stripAnsiSgr("")).toBe("");
  });

  it("removes simple color codes", () => {
    expect(stripAnsiSgr("\x1b[31merror\x1b[0m")).toBe("error");
  });

  it("removes multiple codes and compound parameters", () => {
    const raw = "\x1b[1;31m\x1b[42mtext\x1b[0m";
    expect(stripAnsiSgr(raw)).toBe("text");
  });

  it("leaves plain text unchanged", () => {
    expect(stripAnsiSgr("no codes here")).toBe("no codes here");
  });
});
