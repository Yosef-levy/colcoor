export const COLOOR_EXTENSION_SETTINGS_QUERY = "@ext:colcoor.colcoor-extension";
export const OPEN_SETTINGS_COMMAND_ID = "workbench.action.openSettings";

/** Open VS Code settings focused on this extension's settings. */
export async function openColcoorSettings(
  executeCommand: (command: string, query?: string) => Thenable<unknown> | Promise<unknown>,
): Promise<void> {
  await executeCommand(OPEN_SETTINGS_COMMAND_ID, COLOOR_EXTENSION_SETTINGS_QUERY);
}
