import * as vscode from "vscode";
import { markdownToSafeHtml } from "./threadMarkdown";

/**
 * Forwards growing agent stdout to the conversation webview as throttled, sanitized HTML
 * so the assistant reply appears incrementally instead of in one burst after the CLI exits.
 */
export function createThrottledAssistantStreamPusher(
  getPanel: () => vscode.WebviewPanel | undefined,
  isWebviewReady: () => boolean,
  options?: { intervalMs?: number },
): {
  pushDelta: (rawText: string) => void;
  dispose: () => void;
} {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastRaw = "";
  const intervalMs = options?.intervalMs ?? 50;

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
      if (timer) {
        clearTimeout(timer);
      }
      timer = setTimeout(() => {
        timer = undefined;
        flushNow();
      }, intervalMs);
    },
    dispose() {
      if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }
      flushNow();
      lastRaw = "";
    },
  };
}
