import { describe, expect, it, vi, beforeEach } from "vitest";

const { showErrorMessage, executeCommand } = vi.hoisted(() => ({
  showErrorMessage: vi.fn(),
  executeCommand: vi.fn(),
}));

vi.mock("vscode", () => ({
  window: { showErrorMessage },
  commands: { executeCommand },
}));

import { ColcoorApiHttpError } from "../api/colcoorApiHttpError";
import {
  COLOOR_EXTENSION_SETTINGS_QUERY,
  showColcoorApiFailure,
} from "./showColcoorApiFailure";

describe("showColcoorApiFailure", () => {
  beforeEach(() => {
    showErrorMessage.mockReset();
    executeCommand.mockReset();
  });

  it("shows modal and can open settings for HTTP 402", async () => {
    showErrorMessage.mockResolvedValue("Open Colcoor settings");
    const e = new ColcoorApiHttpError("send", 402, "{}");
    await showColcoorApiFailure(e);
    expect(showErrorMessage).toHaveBeenCalledTimes(1);
    const [title, opts, ...actions] = showErrorMessage.mock.calls[0] as [
      string,
      { modal?: boolean; detail?: string },
      string,
    ];
    expect(title).toBe("Colcoor — plan or usage limit");
    expect(opts.modal).toBe(true);
    expect(opts.detail).toBe(e.message);
    expect(actions).toEqual(["Open Colcoor settings"]);
    expect(executeCommand).toHaveBeenCalledWith(
      "workbench.action.openSettings",
      COLOOR_EXTENSION_SETTINGS_QUERY,
    );
  });

  it("does not open settings when user dismisses 402 modal", async () => {
    showErrorMessage.mockResolvedValue(undefined);
    await showColcoorApiFailure(new ColcoorApiHttpError("x", 402, ""));
    expect(executeCommand).not.toHaveBeenCalled();
  });

  it("uses a single toast for other errors", async () => {
    showErrorMessage.mockResolvedValue(undefined);
    await showColcoorApiFailure(new Error("network down"));
    expect(showErrorMessage).toHaveBeenCalledWith("Colcoor: network down");
  });

  it("shows permission hint for HTTP 403 ColcoorApiHttpError", async () => {
    showErrorMessage.mockResolvedValue(undefined);
    const e = new ColcoorApiHttpError("patch note", 403, '{"detail":"not allowed"}');
    await showColcoorApiFailure(e);
    expect(showErrorMessage).toHaveBeenCalledTimes(1);
    const [text] = showErrorMessage.mock.calls[0] as [string];
    expect(text).toContain("permission denied");
    expect(text).toContain(e.message);
    expect(text).toContain("viewer");
  });

  it("shows sign-in hint for HTTP 401 ColcoorApiHttpError", async () => {
    showErrorMessage.mockResolvedValue(undefined);
    const e = new ColcoorApiHttpError("list conversations", 401, "{}");
    await showColcoorApiFailure(e);
    const [text] = showErrorMessage.mock.calls[0] as [string];
    expect(text).toContain("sign in required");
    expect(text).toContain(e.message);
    expect(text).toContain("Sign in");
  });

  it("shows refresh hint for HTTP 404 ColcoorApiHttpError", async () => {
    showErrorMessage.mockResolvedValue(undefined);
    const e = new ColcoorApiHttpError("get tree", 404, '{"detail":"gone"}');
    await showColcoorApiFailure(e);
    const [text] = showErrorMessage.mock.calls[0] as [string];
    expect(text).toContain("not found");
    expect(text).toContain(e.message);
    expect(text).toMatch(/Refresh conversations|Refresh conversation tree/);
  });
});
