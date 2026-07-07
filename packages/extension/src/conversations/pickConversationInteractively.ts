import * as vscode from "vscode";
import type { ColcoorClient } from "../api/client";
import type { PickedConversation } from "../activation/colcoorExtensionDeps";
import { listConversationsCached } from "./conversationsListCache";
import { normalizedConversationTitle } from "./renameConversationTitle";
import { showColcoorApiFailure } from "../util/showColcoorApiFailure";

export async function pickConversationInteractively(
  api: ColcoorClient,
): Promise<PickedConversation | undefined> {
  try {
    const rows = await listConversationsCached(api);
    if (rows.length === 0) {
      await vscode.window.showWarningMessage("Colcoor: no conversations — create one first.");
      return undefined;
    }
    const picked = await vscode.window.showQuickPick<
      vscode.QuickPickItem & { cid: string; ctitle: string | null; cpinned: boolean }
    >(
      rows.map((r) => ({
        label: r.title?.trim() ? r.title : "(untitled)",
        description: r.id,
        cid: r.id,
        ctitle: r.title,
        cpinned: Boolean(r.pinned),
      })),
      { title: "Colcoor — pick conversation", placeHolder: "Choose a conversation" },
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
