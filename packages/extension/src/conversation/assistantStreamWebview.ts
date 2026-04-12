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
  dispose: () => void;
} {
  let lastRaw = "";

  function flushNow(): void {
    const p = getPanel();
    if (!p || !isWebviewReady()) {
      return;
    }
    void p.webview.postMessage({ type: "assistantStream", html: markdownToSafeHtml(lastRaw) });
  }

  return {
    pushDelta(raw: string) {
      lastRaw = raw;
      flushNow();
    },
    dispose() {
      lastRaw = "";
    },
  };
}
