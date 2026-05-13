#!/usr/bin/env node
/**
 * Package the built MCP server + DXT manifest into a distributable
 * `colcoor-claude-extension-<version>.dxt` archive.
 *
 * A Claude Desktop Extension (DXT) bundle is a plain zip file containing,
 * at the archive root:
 *   - manifest.json   (required by Claude Desktop)
 *   - server.js       (path matches `server.entry_point` in the manifest)
 *   - server.js.map   (optional source map)
 *
 * To stay dependency-free this script writes the ZIP archive itself
 * (DEFLATE-compressed, ZIP version 2.0) using only `node:zlib`.
 */

import { stat, readFile, writeFile, mkdir, rm, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deflateRawSync } from "node:zlib";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");
const dist = path.join(root, "dist");
const build = path.join(root, "build");

// ----- CRC32 (pkzip variant) ----------------------------------------------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    t[i] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

// ----- ZIP writer ----------------------------------------------------------

function dosDateTime(d) {
  const yr = d.getFullYear();
  const date =
    ((Math.max(1980, yr) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  const time =
    (d.getHours() << 11) | (d.getMinutes() << 5) | (Math.floor(d.getSeconds() / 2) & 0x1f);
  return { date: date & 0xffff, time: time & 0xffff };
}

function writeZip(entries) {
  // entries: [{ name: string, data: Buffer }]
  const localChunks = [];
  const centralChunks = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, "utf8");
    const compressed = deflateRawSync(entry.data, { level: 9 });
    const useDeflate = compressed.length < entry.data.length;
    const data = useDeflate ? compressed : entry.data;
    const method = useDeflate ? 8 : 0;
    const crc = crc32(entry.data);
    const { date, time } = dosDateTime(new Date());

    // Local file header (30 bytes + name)
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0); // signature
    localHeader.writeUInt16LE(20, 4); // version needed
    localHeader.writeUInt16LE(0x0800, 6); // flags: bit 11 (UTF-8 names)
    localHeader.writeUInt16LE(method, 8);
    localHeader.writeUInt16LE(time, 10);
    localHeader.writeUInt16LE(date, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(data.length, 18);
    localHeader.writeUInt32LE(entry.data.length, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28); // extra length

    localChunks.push(localHeader, nameBuf, data);

    // Central directory header (46 bytes + name)
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6); // version needed
    central.writeUInt16LE(0x0800, 8); // flags
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(entry.data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30); // extra length
    central.writeUInt16LE(0, 32); // comment length
    central.writeUInt16LE(0, 34); // disk number
    central.writeUInt16LE(0, 36); // internal attrs
    central.writeUInt32LE(0o644 << 16, 38); // external attrs (unix mode bits)
    central.writeUInt32LE(offset, 42);

    centralChunks.push(central, nameBuf);

    offset += localHeader.length + nameBuf.length + data.length;
  }

  const centralBuf = Buffer.concat(centralChunks);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4); // disk number
  eocd.writeUInt16LE(0, 6); // start disk
  eocd.writeUInt16LE(entries.length, 8); // entries on this disk
  eocd.writeUInt16LE(entries.length, 10); // total entries
  eocd.writeUInt32LE(centralBuf.length, 12); // size of central dir
  eocd.writeUInt32LE(offset, 16); // central dir offset
  eocd.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([...localChunks, centralBuf, eocd]);
}

// ----- main ---------------------------------------------------------------

async function ensureFile(p) {
  const s = await stat(p);
  if (!s.isFile()) {
    throw new Error(`expected file: ${p}`);
  }
}

async function readPackageVersion() {
  const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  return String(pkg.version ?? "0.0.0");
}

async function collectArchiveEntries() {
  await ensureFile(path.join(dist, "server.js"));
  await ensureFile(path.join(dist, "manifest.json"));

  const entries = [];
  // Always place manifest.json first so file managers / Claude Desktop can
  // inspect it quickly from the local-file-header stream.
  entries.push({
    name: "manifest.json",
    data: await readFile(path.join(dist, "manifest.json")),
  });

  for (const name of await readdir(dist)) {
    if (name === "manifest.json") continue;
    const full = path.join(dist, name);
    const st = await stat(full);
    if (!st.isFile()) continue;
    entries.push({ name, data: await readFile(full) });
  }
  return entries;
}

async function main() {
  const version = await readPackageVersion();
  const outName = `colcoor-claude-extension-${version}.dxt`;
  const outPath = path.join(build, outName);

  await rm(build, { recursive: true, force: true });
  await mkdir(build, { recursive: true });

  const entries = await collectArchiveEntries();
  const zipBuf = writeZip(entries);
  await writeFile(outPath, zipBuf);

  const stOut = await stat(outPath);
  console.log(
    `package: wrote ${path.relative(root, outPath)} ` +
      `(${entries.length} entries, ${(stOut.size / 1024).toFixed(1)} KB)`,
  );
  console.log(
    "package: to install in Claude Desktop, open Settings → Extensions → " +
      "“Install from file…” and select this .dxt file.",
  );
}

main().catch((e) => {
  console.error(`package: failed — ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
