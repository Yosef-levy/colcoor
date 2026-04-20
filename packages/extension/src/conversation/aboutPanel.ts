import * as vscode from "vscode";

import { getAboutPanelHtml } from "./aboutPanelHtml";

export function showAboutPanel(): void {
  const panel = vscode.window.createWebviewPanel(
    "colcoor.about",
    "Colcoor — Help",
    vscode.ViewColumn.Active,
    { enableScripts: false },
  );
  panel.webview.html = getAboutPanelHtml();
}
