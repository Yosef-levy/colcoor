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
});
