import * as vscode from "vscode";

import { providerDescriptor } from "./providerDescriptors";

export function resolveGeminiAskModel(
  cfg = vscode.workspace.getConfiguration("colcoor"),
): string {
  return (
    cfg.get<string>("geminiAskModel")?.trim() ||
    providerDescriptor("gemini").defaultAskModel
  );
}

export function resolveGeminiAgentModel(
  cfg = vscode.workspace.getConfiguration("colcoor"),
): string {
  return (
    cfg.get<string>("geminiAgentModel")?.trim() ||
    providerDescriptor("gemini").defaultAgentModel
  );
}
