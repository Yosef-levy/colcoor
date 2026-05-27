import * as vscode from "vscode";
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
): {
  pushDelta: (rawText: string) => void;
  pushTimelineEntry: (entry: unknown) => void;
  dispose: () => void;
} {
  let lastRaw = "";
  const timelineEntries: unknown[] = [];
  let activityAfterChars: number | undefined;

  function flushNow(): void {
    const p = getPanel();
    if (!p || !isWebviewReady()) {
      return;
    }
    const split =
      activityAfterChars !== undefined && activityAfterChars >= 0 && activityAfterChars <= lastRaw.length
        ? activityAfterChars
        : undefined;
    void p.webview.postMessage({
      type: "assistantStream",
      html: markdownToSafeHtml(split === undefined ? lastRaw : lastRaw.slice(split)),
      ...(split !== undefined ? { preActivityHtml: markdownToSafeHtml(lastRaw.slice(0, split)) } : {}),
      traceEntries: timelineEntries,
    });
  }

  return {
    pushDelta(raw: string) {
      lastRaw = raw;
      flushNow();
    },
    pushTimelineEntry(entry: unknown) {
      if (activityAfterChars === undefined) {
        activityAfterChars = lastRaw.length;
      }
      timelineEntries.push(entry);
      flushNow();
    },
    dispose() {
      lastRaw = "";
      timelineEntries.length = 0;
      activityAfterChars = undefined;
    },
  };
}
