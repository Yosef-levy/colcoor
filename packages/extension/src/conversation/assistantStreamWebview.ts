import * as vscode from "vscode";
import type { CursorAgentDisplayPart } from "../agent/cursorAgentStreamJson";
import { markdownToSafeHtml } from "./threadMarkdown";

/**
 * Forwards growing agent stdout to the conversation webview as sanitized HTML on every chunk
 * (no debounce — granularity follows the CLI / OS stream).
 *
 * `dispose` does not post a final frame: the next full `state` snapshot carries persisted events.
 * Posting again after `postState` duplicated the assistant in the thread.
 */
export function createAssistantStreamPusher(
  getPanel: () => vscode.WebviewPanel | undefined,
  isWebviewReady: () => boolean,
  options?: {
    runId?: string;
    onFlush?: (frame: { html: string; displayParts?: unknown[] }) => void;
  },
): {
  pushDelta: (rawText: string) => void;
  pushDisplayParts: (parts: CursorAgentDisplayPart[]) => void;
  dispose: () => void;
} {
  let lastRaw = "";
  let lastParts: CursorAgentDisplayPart[] = [];

  function renderDisplayParts(parts: CursorAgentDisplayPart[]): unknown[] {
    return parts.map((part) =>
      part.kind === "assistant"
        ? { kind: "assistant", html: markdownToSafeHtml(part.text) }
        : { kind: "activity", entries: [...part.entries] },
    );
  }

  function flushNow(): void {
    const displayParts = lastParts.length ? renderDisplayParts(lastParts) : undefined;
    const html = markdownToSafeHtml(lastRaw);
    options?.onFlush?.({ html, displayParts });
    const p = getPanel();
    if (!p || !isWebviewReady()) {
      return;
    }
    void p.webview.postMessage({
      type: "assistantStream",
      ...(options?.runId ? { runId: options.runId } : {}),
      html,
      displayParts,
    });
  }

  return {
    pushDelta(raw: string) {
      lastRaw = raw;
      flushNow();
    },
    pushDisplayParts(parts: CursorAgentDisplayPart[]) {
      lastParts = parts.map((part) =>
        part.kind === "assistant"
          ? { kind: "assistant", text: part.text }
          : { kind: "activity", entries: [...part.entries] },
      );
      flushNow();
    },
    dispose() {
      lastRaw = "";
      lastParts = [];
    },
  };
}
