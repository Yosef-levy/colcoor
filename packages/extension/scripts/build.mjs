import { rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");
const watch = process.argv.includes("--watch");

await rm(path.join(root, "dist"), { recursive: true, force: true });

const options = {
  entryPoints: [path.join(root, "src", "extension.ts")],
  outfile: path.join(root, "dist", "extension.js"),
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  sourcemap: true,
  // `vscode` is provided by the host. `@anthropic-ai/claude-agent-sdk` is ESM-only and ships a
  // per-platform native binary via optionalDependencies, so it is resolved at runtime from the
  // packaged node_modules (loaded via dynamic import) rather than bundled.
  external: ["vscode", "@anthropic-ai/claude-agent-sdk"],
  logLevel: "info",
};

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  console.log("Watching extension bundle...");
} else {
  await esbuild.build(options);
}
