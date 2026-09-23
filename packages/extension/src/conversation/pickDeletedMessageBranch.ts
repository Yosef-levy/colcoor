import * as vscode from "vscode";
import type { ColcoorClient, DeletedBranchOut } from "../api/client";
import { formatRelativeTime } from "../util/formatRelativeTime";
import { showColcoorApiFailure } from "../util/showColcoorApiFailure";

const PREVIEW_MAX = 80;

export function deletedBranchPickPreview(branch: DeletedBranchOut): string {
  const title = branch.checkpoint_label?.trim();
  if (title) {
    return title;
  }
  const text = (branch.content_text ?? "").replace(/\s+/g, " ").trim();
  if (!text) {
    return "(empty message)";
  }
  if (text.length <= PREVIEW_MAX) {
    return text;
  }
  return `${text.slice(0, PREVIEW_MAX - 1)}…`;
}

export async function pickDeletedMessageBranchInteractively(
  api: ColcoorClient,
  conversationId: string,
): Promise<DeletedBranchOut | undefined> {
  let rows: DeletedBranchOut[];
  try {
    rows = await api.listDeletedEventBranches(conversationId);
  } catch (e) {
    await showColcoorApiFailure(e);
    return undefined;
  }
  if (rows.length === 0) {
    await vscode.window.showWarningMessage("Colcoor: no deleted message branches to restore.");
    return undefined;
  }
  const picked = await vscode.window.showQuickPick<
    vscode.QuickPickItem & { branch: DeletedBranchOut }
  >(
    rows.map((r) => {
      const nested = r.ancestor_deletion_group_ids.length;
      const countLabel = r.event_count === 1 ? "1 message" : `${r.event_count} messages`;
      return {
        label: deletedBranchPickPreview(r),
        description: `${countLabel} · Deleted ${formatRelativeTime(r.deleted_at)}`,
        detail: nested
          ? `Also restores ${nested} parent branch${nested === 1 ? "" : "es"}`
          : undefined,
        branch: r,
      };
    }),
    {
      title: "Colcoor — restore message branch",
      placeHolder: "Choose a deleted branch to restore",
    },
  );
  return picked?.branch;
}

export async function confirmRestoreDeletedAncestors(ancestorGroupCount: number): Promise<boolean> {
  const n = ancestorGroupCount;
  const choice = await vscode.window.showWarningMessage(
    `This branch sits under ${n} other deleted branch${n === 1 ? "" : "es"}. Restoring it will also restore ${
      n === 1 ? "that parent branch" : "those parent branches"
    }.`,
    { modal: true },
    "Restore including parents",
  );
  return choice === "Restore including parents";
}
