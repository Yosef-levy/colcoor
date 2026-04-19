/**
 * Commands offered when the user opens the tree context menu (right-click) in the
 * conversation webview ([tree-ui-contract.md] §2.3, §5.2). Kept in a vscode-free
 * module so tests can assert IDs against package.json.
 */
export type TreeNodeContextMenuEntry = {
  readonly commandId: string;
  readonly quickPickLabel: string;
  readonly quickPickDescription?: string;
};

export const TREE_NODE_CONTEXT_MENU_ENTRIES: readonly TreeNodeContextMenuEntry[] = [
  {
    commandId: "colcoor.jumpToLatestInConversation",
    quickPickLabel: "Jump to latest in conversation",
    quickPickDescription: "Select the newest leaf on the default branch",
  },
  { commandId: "colcoor.copySelectedMessage", quickPickLabel: "Copy selected message" },
  { commandId: "colcoor.toggleStarSelectedMessage", quickPickLabel: "Toggle star on selected message" },
  { commandId: "colcoor.addNoteToSelectedMessage", quickPickLabel: "Add note to selected message" },
  { commandId: "colcoor.showNotesOnSelectedMessage", quickPickLabel: "Show notes on selected message" },
  { commandId: "colcoor.resendAssistant", quickPickLabel: "Resend assistant" },
  {
    commandId: "colcoor.referenceSelectedMessageInSideChat",
    quickPickLabel: "Reference message in side chat",
  },
  {
    commandId: "colcoor.referenceSelectedNoteInSideChat",
    quickPickLabel: "Reference note in side chat",
    quickPickDescription: "Choose a note on the selected message",
  },
  {
    commandId: "colcoor.refreshConversationTree",
    quickPickLabel: "Refresh conversation tree",
    quickPickDescription: "Reload tree and thread from the server",
  },
  {
    commandId: "colcoor.deleteSelectedMessageSubtree",
    quickPickLabel: "Delete message branch…",
    quickPickDescription: "Remove this message and all replies under it in the tree",
  },
];
