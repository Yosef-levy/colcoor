import type { GraphEventNode } from "../api/client";
import { graphPathToTranscriptTurns, pathFromRootToTip } from "./treeEvents";

/** Plaintext for the root → selected path (for “copy thread”). */
export function buildPlainThread(events: GraphEventNode[], selectedEventId: string): string {
  const node = events.find((e) => e.id === selectedEventId);
  if (!node) {
    return "";
  }
  const path = pathFromRootToTip(events, node);
  const turns = graphPathToTranscriptTurns(path);
  const lines = turns.map((t) => {
    const label = t.role === "user" ? "User" : "Assistant";
    return `${label}: ${(t.content ?? "").trimEnd()}`;
  });
  return lines.join("\n\n").trim();
}
