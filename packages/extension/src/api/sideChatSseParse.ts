/**
 * Incremental SSE parser: complete events end with `\n\n` (api-contracts §10.6).
 * Supports one or more `data:` lines per event (joined with newline per SSE spec).
 */

export function parseCompleteSseDataJsonBlocks(buffer: string): {
  rest: string;
  payloads: string[];
} {
  const payloads: string[] = [];
  let rest = buffer;
  while (true) {
    const sep = rest.indexOf("\n\n");
    if (sep === -1) {
      break;
    }
    const block = rest.slice(0, sep);
    rest = rest.slice(sep + 2);
    const lines = block.split("\n").filter((line) => line.length > 0);
    const dataLines = lines.filter((line) => line.startsWith("data:"));
    if (dataLines.length === 0) {
      continue;
    }
    const merged = dataLines.map((line) => line.replace(/^data:\s?/, "")).join("\n");
    payloads.push(merged);
  }
  return { rest, payloads };
}
