import { describe, expect, it } from "vitest";
import { cursorCliModeFlag, normalizeCursorCliMode } from "./cursorCliMode";

describe("normalizeCursorCliMode", () => {
  it("keeps ask, agent, and plan", () => {
    expect(normalizeCursorCliMode("ask")).toBe("ask");
    expect(normalizeCursorCliMode("agent")).toBe("agent");
    expect(normalizeCursorCliMode("plan")).toBe("plan");
  });

  it("defaults unknown or empty to ask", () => {
    expect(normalizeCursorCliMode(undefined)).toBe("ask");
    expect(normalizeCursorCliMode("")).toBe("ask");
    expect(normalizeCursorCliMode("  ")).toBe("ask");
    expect(normalizeCursorCliMode("yolo")).toBe("ask");
  });
});

describe("cursorCliModeFlag", () => {
  it("passes ask and plan as --mode", () => {
    expect(cursorCliModeFlag("ask")).toEqual(["--mode", "ask"]);
    expect(cursorCliModeFlag("plan")).toEqual(["--mode", "plan"]);
  });

  it("omits --mode for agent (CLI default; --mode agent is invalid)", () => {
    expect(cursorCliModeFlag("agent")).toEqual([]);
  });

  it("omits --mode when unset", () => {
    expect(cursorCliModeFlag(undefined)).toEqual([]);
  });
});
