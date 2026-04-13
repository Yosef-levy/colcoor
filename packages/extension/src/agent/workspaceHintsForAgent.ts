/**
 * Optional editor / git context appended to the transcript sent to `agent -p`
 * (principles.md — workspace integration hints; does not replace Cursor’s tooling).
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";

import * as vscode from "vscode";

import { buildWorkspaceContextBlock } from "./workspaceContextAppendix";

const execFileAsync = promisify(execFile);

const MAX_SELECTION_CHARS = 4000;
const MAX_GIT_DIFF_CHARS = 12_000;

async function tryGitDiffUnified(cwd: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("git", ["diff", "--no-color", "--unified=0"], {
      cwd,
      maxBuffer: 2 * 1024 * 1024,
    });
    const d = stdout.trim();
    if (!d) {
      return null;
    }
    return d.length > MAX_GIT_DIFF_CHARS ? `${d.slice(0, MAX_GIT_DIFF_CHARS)}\n… (truncated)` : d;
  } catch {
    return null;
  }
}

/**
 * Collects active editor path, selection text, and `git diff` when enabled in settings.
 */
export async function collectWorkspaceHintsForAgent(workspaceRoot: string): Promise<string> {
  const cfg = vscode.workspace.getConfiguration("colcoor");
  if (!cfg.get<boolean>("includeWorkspaceHintsInAgentPrompt", true)) {
    return "";
  }
  const root = workspaceRoot.trim();
  let activeFileRelative: string | null = null;
  let selectionSnippet: string | null = null;

  const ed = vscode.window.activeTextEditor;
  if (ed) {
    const doc = ed.document;
    if (doc.uri.scheme === "file") {
      const rel = vscode.workspace.asRelativePath(doc.uri, false);
      activeFileRelative = rel && rel.length > 0 ? rel : doc.uri.fsPath;
    }
    const sel = ed.selection;
    const raw = doc.getText(sel).trim();
    if (raw) {
      selectionSnippet =
        raw.length > MAX_SELECTION_CHARS ? `${raw.slice(0, MAX_SELECTION_CHARS)}\n… (truncated)` : raw;
    }
  }

  let gitDiffUnified: string | null = null;
  if (root) {
    gitDiffUnified = await tryGitDiffUnified(root);
  }

  return buildWorkspaceContextBlock({
    activeFileRelative: activeFileRelative,
    selectionSnippet,
    gitDiffUnified,
  });
}
