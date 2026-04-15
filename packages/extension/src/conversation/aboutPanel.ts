import * as vscode from "vscode";

import { getAboutPanelHtml } from "./aboutPanelHtml";
import { buildLegalPolicySectionHtml, coerceLegalPolicyUrls } from "./legalPolicySection";

function readLegalUrlsFromConfig() {
  const c = vscode.workspace.getConfiguration("colcoor");
  return coerceLegalPolicyUrls({
    termsUrl: c.get<string>("legalTermsUrl"),
    privacyUrl: c.get<string>("legalPrivacyUrl"),
    refundUrl: c.get<string>("legalRefundUrl"),
  });
}

export function showAboutPanel(): void {
  const policySectionHtml = buildLegalPolicySectionHtml(readLegalUrlsFromConfig());
  const panel = vscode.window.createWebviewPanel(
    "colcoor.about",
    "Colcoor — Help",
    vscode.ViewColumn.Active,
    { enableScripts: false },
  );
  panel.webview.html = getAboutPanelHtml(policySectionHtml);
}
