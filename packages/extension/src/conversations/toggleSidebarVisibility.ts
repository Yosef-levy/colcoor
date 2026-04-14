export const TOGGLE_SIDEBAR_COMMAND_ID = "workbench.action.toggleSidebarVisibility";

/** Toggle VS Code sidebar visibility (used to minimize/restore the conversations list). */
export async function toggleSidebarVisibility(
  executeCommand: (command: string) => Thenable<unknown> | Promise<unknown>,
): Promise<void> {
  await executeCommand(TOGGLE_SIDEBAR_COMMAND_ID);
}
