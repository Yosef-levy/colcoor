import { describe, expect, it } from "vitest";
import { processEnvForCursorCli } from "./agentPathEnv";
import { buildAgentPrintArgs, buildEnvForAgentSpawn, normalizeAgentCliOutputMode } from "./cursorCliSpawn";

describe("normalizeAgentCliOutputMode", () => {
  it("accepts known values", () => {
    expect(normalizeAgentCliOutputMode("text")).toBe("text");
    expect(normalizeAgentCliOutputMode("stream-json")).toBe("stream-json");
    expect(normalizeAgentCliOutputMode("stream-json-partial")).toBe("stream-json-partial");
  });

  it("defaults invalid or empty to stream-json-partial", () => {
    expect(normalizeAgentCliOutputMode(undefined)).toBe("stream-json-partial");
    expect(normalizeAgentCliOutputMode("")).toBe("stream-json-partial");
    expect(normalizeAgentCliOutputMode("nope")).toBe("stream-json-partial");
  });
});

describe("buildAgentPrintArgs", () => {
  const ws = "/tmp/ws";
  const prompt = "hello";

  it("builds text mode argv", () => {
    expect(buildAgentPrintArgs(ws, prompt, "text")).toEqual([
      "-p",
      "--output-format",
      "text",
      "--trust",
      "--workspace",
      ws,
      prompt,
    ]);
  });

  it("builds stream-json without partial flag", () => {
    expect(buildAgentPrintArgs(ws, prompt, "stream-json")).toEqual([
      "-p",
      "--output-format",
      "stream-json",
      "--trust",
      "--workspace",
      ws,
      prompt,
    ]);
  });

  it("builds stream-json with partial flag", () => {
    expect(buildAgentPrintArgs(ws, prompt, "stream-json-partial")).toEqual([
      "-p",
      "--output-format",
      "stream-json",
      "--stream-partial-output",
      "--trust",
      "--workspace",
      ws,
      prompt,
    ]);
  });
});

describe("buildEnvForAgentSpawn", () => {
  it("matches processEnvForCursorCli when no stored key", () => {
    expect(buildEnvForAgentSpawn(undefined)).toEqual(processEnvForCursorCli());
    expect(buildEnvForAgentSpawn("")).toEqual(processEnvForCursorCli());
    expect(buildEnvForAgentSpawn("   ")).toEqual(processEnvForCursorCli());
  });

  it("sets CURSOR_API_KEY from trimmed stored key and keeps PATH augmentation", () => {
    const base = processEnvForCursorCli();
    const env = buildEnvForAgentSpawn("  my-key  ");
    expect(env.CURSOR_API_KEY).toBe("my-key");
    expect(env.PATH).toBe(base.PATH);
  });
});
