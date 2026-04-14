import * as vscode from "vscode";

import { getAboutPanelHtml } from "./aboutPanelHtml";
import { buildLegalPolicySectionHtml } from "./legalPolicySection";

function readLegalUrlsFromConfig(): {
  termsUrl?: string;
  privacyUrl?: string;
  refundUrl?: string;
} {
  const c = vscode.workspace.getConfiguration("colcoor");
  const termsUrl = c.get<string>("legalTermsUrl")?.trim();
  const privacyUrl = c.get<string>("legalPrivacyUrl")?.trim();
  const refundUrl = c.get<string>("legalRefundUrl")?.trim();
  return {
    ...(termsUrl ? { termsUrl } : {}),
    ...(privacyUrl ? { privacyUrl } : {}),
    ...(refundUrl ? { refundUrl } : {}),
  };
}

export function showAboutPanel(): void {
  const policySectionHtml = buildLegalPolicySectionHtml(readLegalUrlsFromConfig());
  const panel = vscode.window.createWebviewPanel(
    "colcoor.about",
    "About Colcoor",
    vscode.ViewColumn.Active,
    { enableScripts: false },
  );
  panel.webview.html = getAboutPanelHtml(policySectionHtml);
}
