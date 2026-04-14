/**
 * Strip ANSI SGR (Select Graphic Rendition) sequences, e.g. `ESC [31m` from Cursor CLI stderr.
 */
export function stripAnsiSgr(s: string): string {
  // eslint-disable-next-line no-control-regex -- intentional match of CSI SGR
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}
