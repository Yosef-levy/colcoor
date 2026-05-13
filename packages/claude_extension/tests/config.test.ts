import { describe, expect, it } from "vitest";

import { loadConfigFromEnv, assertHasBackendUrl } from "../src/config.js";

describe("loadConfigFromEnv", () => {
  it("trims and normalizes the backend base URL", () => {
    const cfg = loadConfigFromEnv({
      COLCOOR_BACKEND_URL: "  http://127.0.0.1:8000/  ",
    });
    expect(cfg.backendBaseUrl).toBe("http://127.0.0.1:8000");
  });

  it("defaults provider hint to 'auto' for unknown values", () => {
    const cfg = loadConfigFromEnv({
      COLCOOR_BACKEND_URL: "http://x",
      COLCOOR_PROVIDER_HINT: "weird",
    });
    expect(cfg.providerHint).toBe("auto");
  });

  it("accepts a recognized provider hint case-insensitively", () => {
    const cfg = loadConfigFromEnv({
      COLCOOR_BACKEND_URL: "http://x",
      COLCOOR_PROVIDER_HINT: "GitHub",
    });
    expect(cfg.providerHint).toBe("github");
  });

  it("falls back to default timeout when value is non-numeric", () => {
    const cfg = loadConfigFromEnv({
      COLCOOR_BACKEND_URL: "http://x",
      COLCOOR_REQUEST_TIMEOUT_MS: "not-a-number",
    });
    expect(cfg.requestTimeoutMs).toBe(30_000);
  });

  it("uses a custom agent author when set", () => {
    const cfg = loadConfigFromEnv({
      COLCOOR_BACKEND_URL: "http://x",
      COLCOOR_AGENT_AUTHOR: "  my-agent  ",
    });
    expect(cfg.agentAuthor).toBe("my-agent");
  });

  it("defaults agent author to claude_desktop", () => {
    const cfg = loadConfigFromEnv({ COLCOOR_BACKEND_URL: "http://x" });
    expect(cfg.agentAuthor).toBe("claude_desktop");
  });

  it("assertHasBackendUrl throws when missing", () => {
    expect(() => assertHasBackendUrl(loadConfigFromEnv({}))).toThrow(/COLCOOR_BACKEND_URL/);
  });
});
