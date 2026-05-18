import * as vscode from "vscode";

let channel: vscode.OutputChannel | undefined;

/** Shared Colcoor output channel for diagnostics (SSE reconnect, etc.). */
export function getColcoorOutputLog(): vscode.OutputChannel {
  if (!channel) {
    channel = vscode.window.createOutputChannel("Colcoor");
  }
  return channel;
}
