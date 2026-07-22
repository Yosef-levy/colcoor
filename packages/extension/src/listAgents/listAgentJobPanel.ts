import { randomBytes } from "node:crypto";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as vscode from "vscode";

import type { AgentRunner } from "../agent/agentRunner";
import type { ColcoorClient } from "../api/client";
import { getListAgentJobPanelHtml } from "./listAgentJobPanelHtml";
import { listJobIds, loadJobSnapshot } from "./jobPackage";
import {
  applyUserReviewAndCommit,
  requestJobCancel,
  runListBuilderJob,
  runListOperatorJob,
  type ListAgentProgressEvent,
  type RunListAgentJobOptions,
} from "./runListAgentJob";
import type { VerifiedProposalRow } from "./types";

export type ListAgentJobPanelController = {
  openJob: (jobId: string) => Promise<void>;
  startAndOpenBuilder: (args: {
    conversationId: string;
    requestText: string;
    targetListName: string;
    currentUserId: string | null;
    autoCommit?: boolean;
  }) => Promise<string>;
  startAndOpenOperator: (args: {
    conversationId: string;
    requestText: string;
    listIds: string[];
    currentUserId: string | null;
  }) => Promise<string>;
  pickAndOpenJob: () => Promise<void>;
  dispose: () => void;
};

type ActiveRun = {
  jobId: string;
  abort: AbortController;
};

export function createListAgentJobPanelController(
  context: vscode.ExtensionContext,
  deps: {
    api: ColcoorClient;
    agent: AgentRunner;
    getWorkspaceRoot: () => string;
  },
): ListAgentJobPanelController {
  let panel: vscode.WebviewPanel | undefined;
  let currentJobId: string | undefined;
  let activeRun: ActiveRun | undefined;
  let webviewReady = false;
  let pendingSnapshotJobId: string | undefined;

  function workspaceRoot(): string {
    const root = deps.getWorkspaceRoot();
    if (!root) {
      throw new Error("Open a workspace folder to run list agent jobs.");
    }
    return root;
  }

  function ensurePanel(): vscode.WebviewPanel {
    if (panel) {
      panel.reveal(vscode.ViewColumn.Beside, true);
      return panel;
    }
    panel = vscode.window.createWebviewPanel(
      "colcoor.listAgentJob",
      "Colcoor list agent",
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
      { enableScripts: true, retainContextWhenHidden: true },
    );
    webviewReady = false;

    // Register message handler BEFORE setting HTML so the initial `ready` is not lost.
    panel.webview.onDidReceiveMessage(async (msg: unknown) => {
      const m = msg as {
        type?: string;
        acceptedIds?: string[];
        rejectedIds?: string[];
      };
      if (!m?.type) return;
      try {
        if (m.type === "ready") {
          webviewReady = true;
          const jobId = pendingSnapshotJobId ?? currentJobId;
          if (jobId) {
            await postSnapshot(jobId);
          }
          return;
        }
        if (!currentJobId) return;
        if (m.type === "reloadJob") {
          await postSnapshot(currentJobId);
        } else if (m.type === "cancelJob") {
          await requestJobCancel(workspaceRoot(), currentJobId);
          activeRun?.abort.abort();
          void vscode.window.showInformationMessage("Colcoor: cancel requested for list agent job.");
          await postSnapshot(currentJobId);
        } else if (m.type === "commitReview") {
          const root = workspaceRoot();
          await applyUserReviewAndCommit(
            {
              workspaceRoot: root,
              jobId: currentJobId,
              api: deps.api,
              agent: deps.agent,
              onEvent: (ev) => postProgress(ev),
            },
            m.acceptedIds ?? [],
            m.rejectedIds ?? [],
          );
          await postSnapshot(currentJobId);
          void vscode.window.showInformationMessage("Colcoor: list items committed.");
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        void vscode.window.showErrorMessage(`Colcoor list agent: ${message}`);
        if (currentJobId) {
          await postSnapshot(currentJobId).catch(() => undefined);
        }
      }
    });

    panel.onDidDispose(() => {
      panel = undefined;
      webviewReady = false;
      // Closing UI does not cancel the run
    });

    const nonce = randomBytes(16).toString("hex");
    panel.webview.html = getListAgentJobPanelHtml(panel.webview.cspSource, nonce);
    context.subscriptions.push(panel);
    return panel;
  }

  function postProgress(ev: ListAgentProgressEvent): void {
    if (!panel) return;
    void panel.webview.postMessage({ type: "progressEvent", event: ev });
  }

  async function postSnapshot(jobId: string): Promise<void> {
    if (!panel) return;
    pendingSnapshotJobId = jobId;
    const root = workspaceRoot();
    const { manifest, state, runLog, jobPath } = await loadJobSnapshot(root, jobId);
    let rows: VerifiedProposalRow[] | undefined;
    try {
      const raw = await fs.readFile(path.join(jobPath, "out", "verification.json"), "utf8");
      rows = (JSON.parse(raw) as { rows: VerifiedProposalRow[] }).rows;
    } catch {
      rows = undefined;
    }
    let progressTail = "";
    try {
      progressTail = await fs.readFile(path.join(jobPath, "out", "progress.jsonl"), "utf8");
    } catch {
      progressTail = "";
    }
    const combinedLog = [runLog?.trim(), progressTail?.trim()].filter(Boolean).join("\n");
    await panel.webview.postMessage({
      type: "jobSnapshot",
      jobId,
      kind: manifest.kind,
      conversationId: manifest.conversation_id,
      status: state.status,
      phase: state.phase,
      error: state.error,
      scan: {
        covered: state.scan_coverage_summary.covered_lines,
        total: state.scan_coverage_summary.total_lines,
        complete: state.scan_coverage_summary.complete,
        covered_lines: state.scan_coverage_summary.covered_lines,
        total_lines: state.scan_coverage_summary.total_lines,
      },
      runLog: combinedLog,
      rows,
    });
  }

  async function openJob(jobId: string): Promise<void> {
    currentJobId = jobId;
    pendingSnapshotJobId = jobId;
    ensurePanel();
    panel!.title = `Colcoor job ${jobId.slice(0, 8)}`;
    await postSnapshot(jobId);
  }

  async function runInBackground(
    jobId: string,
    kind: "list-builder" | "list-operator",
  ): Promise<void> {
    const root = workspaceRoot();
    const abort = new AbortController();
    activeRun = { jobId, abort };
    const base: RunListAgentJobOptions = {
      workspaceRoot: root,
      jobId,
      api: deps.api,
      agent: deps.agent,
      signal: abort.signal,
      onEvent: (ev) => {
        if (currentJobId === jobId) postProgress(ev);
      },
    };
    try {
      if (kind === "list-builder") {
        await runListBuilderJob(base);
      } else {
        await runListOperatorJob(base);
      }
      if (currentJobId === jobId) await postSnapshot(jobId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message !== "cancelled") {
        void vscode.window.showErrorMessage(`Colcoor list agent: ${message}`);
      }
      if (currentJobId === jobId) await postSnapshot(jobId).catch(() => undefined);
    } finally {
      if (activeRun?.jobId === jobId) activeRun = undefined;
    }
  }

  return {
    async openJob(jobId: string) {
      await openJob(jobId);
    },

    async startAndOpenBuilder(args) {
      const { freezeListBuilderJob } = await import("./jobPackage");
      const frozen = await freezeListBuilderJob({
        workspaceRoot: workspaceRoot(),
        api: deps.api,
        conversationId: args.conversationId,
        requestText: args.requestText,
        targetListName: args.targetListName,
        currentUserId: args.currentUserId,
        autoCommit: args.autoCommit,
      });
      await openJob(frozen.jobId);
      void runInBackground(frozen.jobId, "list-builder");
      return frozen.jobId;
    },

    async startAndOpenOperator(args) {
      const { freezeListOperatorJob } = await import("./jobPackage");
      const frozen = await freezeListOperatorJob({
        workspaceRoot: workspaceRoot(),
        api: deps.api,
        conversationId: args.conversationId,
        requestText: args.requestText,
        listIds: args.listIds,
        currentUserId: args.currentUserId,
      });
      await openJob(frozen.jobId);
      void runInBackground(frozen.jobId, "list-operator");
      return frozen.jobId;
    },

    async pickAndOpenJob() {
      const root = workspaceRoot();
      const ids = await listJobIds(root);
      if (ids.length === 0) {
        void vscode.window.showInformationMessage("Colcoor: no list agent jobs in this workspace.");
        return;
      }
      const items = await Promise.all(
        ids.map(async (id) => {
          try {
            const { manifest, state } = await loadJobSnapshot(root, id);
            return {
              label: `${manifest.kind} ${id.slice(0, 8)}`,
              description: state.status,
              detail: manifest.conversation_id,
              jobId: id,
            };
          } catch {
            return { label: id, description: "unreadable", jobId: id };
          }
        }),
      );
      const picked = await vscode.window.showQuickPick(items, {
        title: "Colcoor list agent jobs",
      });
      if (picked) await openJob(picked.jobId);
    },

    dispose() {
      panel?.dispose();
      activeRun?.abort.abort();
    },
  };
}
