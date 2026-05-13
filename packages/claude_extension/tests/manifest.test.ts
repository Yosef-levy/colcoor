import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const manifestPath = join(__dirname, "..", "manifest.json");

type Manifest = {
  dxt_version: string;
  name: string;
  version: string;
  server: {
    type: string;
    entry_point: string;
    mcp_config: { command: string; args: string[]; env: Record<string, string> };
  };
  user_config: Record<string, { type: string; required?: boolean; default?: unknown }>;
  tools: { name: string; description?: string }[];
  prompts: { name: string }[];
};

describe("manifest.json", () => {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Manifest;

  it("declares a DXT manifest with the expected top-level keys", () => {
    expect(manifest.dxt_version).toBeTruthy();
    expect(manifest.name).toBe("colcoor");
    expect(manifest.version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("entrypoint references the built bundle", () => {
    expect(manifest.server.type).toBe("node");
    expect(manifest.server.entry_point).toBe("server.js");
    expect(manifest.server.mcp_config.command).toBe("node");
    expect(manifest.server.mcp_config.args.join(" ")).toContain("server.js");
  });

  it("requires the backend URL as user config", () => {
    expect(manifest.user_config.backend_url?.required).toBe(true);
    expect(manifest.user_config.api_token?.required).toBe(false);
  });

  it("exports a healthy number of Colcoor tools", () => {
    const names = manifest.tools.map((t) => t.name);
    expect(names.length).toBeGreaterThanOrEqual(30);
    for (const required of [
      "colcoor_health",
      "colcoor_list_conversations",
      "colcoor_create_conversation",
      "colcoor_get_conversation_tree",
      "colcoor_append_user_message",
      "colcoor_post_side_chat_message",
    ]) {
      expect(names).toContain(required);
    }
  });

  it("env wiring binds expected user_config fields", () => {
    const env = manifest.server.mcp_config.env;
    expect(env.COLCOOR_BACKEND_URL).toContain("backend_url");
    expect(env.COLCOOR_API_TOKEN).toContain("api_token");
    expect(env.COLCOOR_AGENT_AUTHOR).toContain("agent_author");
  });
});
