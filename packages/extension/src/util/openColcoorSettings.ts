export const COLOOR_EXTENSION_SETTINGS_QUERY = "@ext:colcoor.colcoor-extension";
export const OPEN_SETTINGS_COMMAND_ID = "workbench.action.openSettings";

export type OpenColcoorSettingsOptions = {
  /** Extra search text after the extension filter (e.g. `legal` for policy URL keys). */
  searchSuffix?: string;
};

/** Open VS Code settings focused on this extension's settings (optional search suffix). */
export async function openColcoorSettings(
  executeCommand: (command: string, query?: string) => Thenable<unknown> | Promise<unknown>,
  options?: OpenColcoorSettingsOptions,
): Promise<void> {
  const suffix = options?.searchSuffix?.trim();
  const query = suffix ? `${COLOOR_EXTENSION_SETTINGS_QUERY} ${suffix}` : COLOOR_EXTENSION_SETTINGS_QUERY;
  await executeCommand(OPEN_SETTINGS_COMMAND_ID, query);
}
