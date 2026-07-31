import { describe, expect, it } from "vitest";

import { parseSlashCommand, slashAutocompleteContext } from "./parseSlashCommand";

describe("parseSlashCommand", () => {
  it("parses /colcoor-help with no args", () => {
    expect(parseSlashCommand("/colcoor-help")).toEqual({
      name: "colcoor-help",
      args: "",
      rawText: "/colcoor-help",
    });
  });

  it("parses args and trims surrounding whitespace", () => {
    expect(parseSlashCommand("  /colcoor-model  sonnet-4  ")).toEqual({
      name: "colcoor-model",
      args: "sonnet-4",
      rawText: "/colcoor-model  sonnet-4",
    });
  });

  it("parses provider-native commands", () => {
    expect(parseSlashCommand("/context")).toMatchObject({ name: "context", args: "" });
    expect(parseSlashCommand("/deploy staging")).toMatchObject({
      name: "deploy",
      args: "staging",
    });
  });

  it("returns null for ordinary text and mid-line slashes", () => {
    expect(parseSlashCommand("hello")).toBeNull();
    expect(parseSlashCommand("see /tmp/file")).toBeNull();
    expect(parseSlashCommand("please /colcoor-help")).toBeNull();
  });

  it("rejects empty slash", () => {
    expect(parseSlashCommand("/")).toBeNull();
    expect(parseSlashCommand("/ ")).toBeNull();
  });
});

describe("slashAutocompleteContext", () => {
  it("activates only for a leading slash token", () => {
    expect(slashAutocompleteContext("/col", 4)).toEqual({
      start: 0,
      end: 4,
      query: "col",
    });
    expect(slashAutocompleteContext("  /colcoor-", 11)).toEqual({
      start: 2,
      end: 11,
      query: "colcoor-",
    });
  });

  it("closes after whitespace in the token", () => {
    expect(slashAutocompleteContext("/colcoor-help ", 14)).toBeNull();
    expect(slashAutocompleteContext("hello /x", 8)).toBeNull();
  });
});
