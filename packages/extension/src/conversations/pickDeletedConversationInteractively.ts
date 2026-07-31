import * as vscode from "vscode";
import type { ColcoorClient } from "../api/client";
import type { PickedConversation } from "../activation/colcoorExtensionDeps";
import { listDeletedConversationsCached } from "./conversationsListCache";
import { formatRelativeTime } from "../util/formatRelativeTime";
import { normalizedConversationTitle } from "./renameConversationTitle";
import { showColcoorApiFailure } from "../util/showColcoorApiFailure";

export async function pickDeletedConversationInteractively(
  api: ColcoorClient,
): Promise<PickedConversation | undefined> {
  try {
    const rows = await listDeletedConversationsCached(api);
    if (rows.length === 0) {
      await vscode.window.showWarningMessage("Colcoor: no deleted conversations to restore.");
      return undefined;
    }
    const picked = await vscode.window.showQuickPick<
      vscode.QuickPickItem & { cid: string; ctitle: string | null; cpinned: boolean }
    >(
      rows.map((r) => ({
        label: r.title?.trim() ? r.title : "(untitled)",
        description: r.id,
        detail: r.deleted_at
          ? `Deleted ${formatRelativeTime(r.deleted_at)}`
          : "Soft-deleted",
        cid: r.id,
        ctitle: r.title,
        cpinned: Boolean(r.pinned),
      })),
      {
        title: "Colcoor — restore deleted conversation",
        placeHolder: "Choose a conversation to restore",
      },
    );
    if (!picked) {
      return undefined;
    }
    return {
      id: picked.cid,
      title: normalizedConversationTitle(picked.ctitle ?? ""),
      pinned: picked.cpinned,
    };
  } catch (e) {
    await showColcoorApiFailure(e);
    return undefined;
  }
}
