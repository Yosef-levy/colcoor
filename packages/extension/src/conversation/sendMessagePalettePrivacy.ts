import type { QuickPickItem } from "vscode";

import {
  PRIVATE_BRANCH_DESCRIPTION,
  PRIVATE_BRANCH_LEAD,
} from "./privateBranchComposerCopy";

export type SendMessagePrivacyPickItem = QuickPickItem & { sendAsPrivate: boolean };

/** QuickPick rows for `colcoor.sendMessage` after text + checkpoint ([ui-features.md] §9). */
export function sendMessagePrivacyQuickPickItems(): SendMessagePrivacyPickItem[] {
  return [
    {
      label: "Shared",
      description: "Visible to collaborators on this conversation (default).",
      sendAsPrivate: false,
    },
    {
      label: `${PRIVATE_BRANCH_LEAD} (only you)`,
      description: PRIVATE_BRANCH_DESCRIPTION,
      sendAsPrivate: true,
    },
  ];
}

/** Esc / dismiss on the picker → shared (same as choosing the first row). */
export function isPrivateBranchFromPrivacyPick(picked: SendMessagePrivacyPickItem | undefined): boolean {
  return Boolean(picked?.sendAsPrivate);
}
