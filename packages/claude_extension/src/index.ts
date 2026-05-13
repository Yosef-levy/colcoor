#!/usr/bin/env node
/**
 * Colcoor Claude Desktop Extension — MCP server entry point.
 *
 * Reads runtime config from environment variables (see `.env.example` and
 * `manifest.json` for the Claude Desktop user-config bindings), wires up
 * tools/prompts via `buildColcoorMcpServer`, and serves the MCP protocol
 * over stdio. Claude Desktop spawns this process for the lifetime of the
 * extension session.
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { buildColcoorMcpServer, maybeAutoSignIn } from "./server.js";

function log(line: string): void {
  // Diagnostics go to stderr so they never interfere with the JSON-RPC stdout stream.
  process.stderr.write(`${line}\n`);
}

async function main(): Promise<void> {
  let built;
  try {
    built = buildColcoorMcpServer({ log });
  } catch (e) {
    log(`colcoor: failed to start — ${(e as Error).message}`);
    process.exit(1);
  }

  await maybeAutoSignIn(built, log);

  const transport = new StdioServerTransport();
  await built.server.connect(transport);

  log(
    `colcoor: MCP server ready (backend=${built.config.backendBaseUrl}, ` +
      `signed_in=${built.tokens.isSignedIn()})`,
  );

  process.on("SIGINT", () => {
    log("colcoor: received SIGINT, shutting down");
    void built.server.close().finally(() => process.exit(0));
  });
  process.on("SIGTERM", () => {
    log("colcoor: received SIGTERM, shutting down");
    void built.server.close().finally(() => process.exit(0));
  });
}

main().catch((e) => {
  log(`colcoor: fatal error — ${(e as Error).stack ?? String(e)}`);
  process.exit(1);
});
