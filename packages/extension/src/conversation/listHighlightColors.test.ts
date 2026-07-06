import { describe, expect, it } from "vitest";
import {
  flattenListHighlightColorGrid,
  LIST_HIGHLIGHT_COLOR_GRID,
} from "./listHighlightColors";

describe("LIST_HIGHLIGHT_COLOR_GRID", () => {
  it("is a compact 2d grid of hex colors", () => {
    expect(LIST_HIGHLIGHT_COLOR_GRID.length).toBeGreaterThanOrEqual(2);
    for (const row of LIST_HIGHLIGHT_COLOR_GRID) {
      expect(row.length).toBeGreaterThanOrEqual(4);
      for (const color of row) {
        expect(color).toMatch(/^#[0-9a-f]{6}$/i);
      }
    }
  });

  it("includes the original default palette colors", () => {
    const values = new Set(flattenListHighlightColorGrid());
    expect(values.has("#f59e0b")).toBe(true);
    expect(values.has("#10b981")).toBe(true);
    expect(values.has("#3b82f6")).toBe(true);
  });

  it("flattens without duplicate entries", () => {
    const flat = flattenListHighlightColorGrid();
    expect(flat.length).toBeGreaterThanOrEqual(10);
    expect(new Set(flat).size).toBe(flat.length);
  });
});
