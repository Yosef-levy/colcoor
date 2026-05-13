#!/usr/bin/env node
/**
 * Bundle the Claude Desktop Extension MCP server into a single, self-contained
 * `dist/server.js` (Node ESM). Claude Desktop spawns the bundle directly via
 * `node dist/server.js` (configured in `manifest.json`).
 */

import { rm, mkdir, cp, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");
const watch = process.argv.includes("--watch");

const dist = path.join(root, "dist");
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

const options = {
  entryPoints: [path.join(root, "src", "index.ts")],
  outfile: path.join(dist, "server.js"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node18",
  sourcemap: true,
  // No native deps in our tree; keep zero externals so the DXT can run on a stock Node.
  external: [],
  legalComments: "none",
  banner: {
    // Allow `__dirname` and other CJS shims inside ESM bundles for any deps that need them.
    js: [
      "import { createRequire as __cjsCreateRequire } from 'node:module';",
      "import { fileURLToPath as __cjsFileURLToPath } from 'node:url';",
      "import { dirname as __cjsDirname } from 'node:path';",
      "const require = __cjsCreateRequire(import.meta.url);",
      "const __filename = __cjsFileURLToPath(import.meta.url);",
      "const __dirname = __cjsDirname(__filename);",
    ].join("\n"),
  },
  logLevel: "info",
};

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  console.log("Watching Colcoor Claude extension bundle...");
} else {
  await esbuild.build(options);

  // Copy the DXT manifest next to the bundle so the packaging script can zip it
  // without worrying about source layout.
  const manifestSrc = path.join(root, "manifest.json");
  try {
    await access(manifestSrc);
    await cp(manifestSrc, path.join(dist, "manifest.json"));
  } catch {
    console.warn("build: manifest.json not found next to package.json — skipping copy.");
  }

  console.log(`build: wrote ${path.relative(root, options.outfile)}`);
}
