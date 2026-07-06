import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import type { ColcoorClient } from "../api/client";
import { getConversationImageRawCached } from "./conversationImageBytesCache";
import { parseUserMediaImages } from "./userEventMedia";

export async function writeUserMediaToTempFiles(
  api: ColcoorClient,
  conversationId: string,
  contentJson: Record<string, unknown> | undefined,
): Promise<string[]> {
  const imgs = parseUserMediaImages(contentJson);
  const paths: string[] = [];
  for (const im of imgs) {
    const { arrayBuffer } = await getConversationImageRawCached(api, conversationId, im.id);
    const ext =
      im.mime_type === "image/png"
        ? "png"
        : im.mime_type === "image/jpeg"
          ? "jpg"
          : im.mime_type === "image/webp"
            ? "webp"
            : im.mime_type === "image/gif"
              ? "gif"
              : "img";
    const p = path.join(os.tmpdir(), `colcoor-${im.id}.${ext}`);
    await fs.writeFile(p, Buffer.from(arrayBuffer));
    paths.push(p);
  }
  return paths;
}

export async function cleanupTempPaths(paths: readonly string[]): Promise<void> {
  await Promise.all(paths.map((p) => fs.unlink(p).catch(() => {})));
}

export function appendixForAgentImagePaths(paths: readonly string[]): string {
  if (!paths.length) {
    return "";
  }
  return `\n\n[Attached images — local files]\n${paths.join("\n")}\n`;
}
