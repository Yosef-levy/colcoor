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
  COLOOR_API_FAILURE_OPEN_ABOUT_ACTION,
  COLOOR_API_FAILURE_OPEN_SETTINGS_ACTION,
  COLOOR_API_FAILURE_REFRESH_CONVERSATION_TREE_ACTION,
  COLOOR_API_FAILURE_REFRESH_CONVERSATIONS_ACTION,
  COLOOR_API_FAILURE_SIGN_IN_ACTION,
} from "./colcoorApiFailureActions";
import { showColcoorApiFailure } from "./showColcoorApiFailure";

describe("showColcoorApiFailure", () => {
  beforeEach(() => {
    showErrorMessage.mockReset();
    executeCommand.mockReset();
  });

  it("shows modal and can open settings for HTTP 402", async () => {
    showErrorMessage.mockResolvedValue(COLOOR_API_FAILURE_OPEN_SETTINGS_ACTION);
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
    expect(actions).toEqual([COLOOR_API_FAILURE_OPEN_SETTINGS_ACTION]);
    expect(executeCommand).toHaveBeenCalledWith("colcoor.openSettings");
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

  it("shows permission hint and About action for HTTP 403 ColcoorApiHttpError", async () => {
    showErrorMessage.mockResolvedValue(undefined);
    const e = new ColcoorApiHttpError("patch note", 403, '{"detail":"not allowed"}');
    await showColcoorApiFailure(e);
    expect(showErrorMessage).toHaveBeenCalledWith(
      expect.stringContaining("permission denied"),
      COLOOR_API_FAILURE_OPEN_ABOUT_ACTION,
    );
    const [text] = showErrorMessage.mock.calls[0] as [string];
    expect(text).toContain(e.message);
    expect(text).toContain("viewer");
  });

  it("runs Colcoor: About when user picks the 403 action", async () => {
    showErrorMessage.mockResolvedValue(COLOOR_API_FAILURE_OPEN_ABOUT_ACTION);
    await showColcoorApiFailure(new ColcoorApiHttpError("x", 403, ""));
    expect(executeCommand).toHaveBeenCalledWith("colcoor.openAbout");
  });

  it("shows sign-in action for HTTP 401 ColcoorApiHttpError", async () => {
    showErrorMessage.mockResolvedValue(undefined);
    const e = new ColcoorApiHttpError("list conversations", 401, "{}");
    await showColcoorApiFailure(e);
    expect(showErrorMessage).toHaveBeenCalledWith(
      expect.stringContaining("sign in required"),
      COLOOR_API_FAILURE_SIGN_IN_ACTION,
    );
    const [text] = showErrorMessage.mock.calls[0] as [string];
    expect(text).toContain(e.message);
  });

  it("runs Colcoor: Sign in when user picks the 401 action", async () => {
    showErrorMessage.mockResolvedValue(COLOOR_API_FAILURE_SIGN_IN_ACTION);
    await showColcoorApiFailure(new ColcoorApiHttpError("x", 401, ""));
    expect(executeCommand).toHaveBeenCalledWith("colcoor.signIn");
  });

  it("does not run sign-in when user dismisses the 401 toast", async () => {
    showErrorMessage.mockResolvedValue(undefined);
    await showColcoorApiFailure(new ColcoorApiHttpError("x", 401, ""));
    expect(executeCommand).not.toHaveBeenCalledWith("colcoor.signIn");
  });

  it("shows refresh actions for HTTP 404 ColcoorApiHttpError", async () => {
    showErrorMessage.mockResolvedValue(undefined);
    const e = new ColcoorApiHttpError("get tree", 404, '{"detail":"gone"}');
    await showColcoorApiFailure(e);
    expect(showErrorMessage).toHaveBeenCalledWith(
      expect.stringContaining("not found"),
      COLOOR_API_FAILURE_REFRESH_CONVERSATIONS_ACTION,
      COLOOR_API_FAILURE_REFRESH_CONVERSATION_TREE_ACTION,
    );
    const [text] = showErrorMessage.mock.calls[0] as [string];
    expect(text).toContain(e.message);
  });

  it("runs refresh commands when user picks a 404 action", async () => {
    showErrorMessage.mockResolvedValue(COLOOR_API_FAILURE_REFRESH_CONVERSATIONS_ACTION);
    await showColcoorApiFailure(new ColcoorApiHttpError("x", 404, ""));
    expect(executeCommand).toHaveBeenCalledWith("colcoor.refreshConversations");

    executeCommand.mockReset();
    showErrorMessage.mockResolvedValue(COLOOR_API_FAILURE_REFRESH_CONVERSATION_TREE_ACTION);
    await showColcoorApiFailure(new ColcoorApiHttpError("y", 404, ""));
    expect(executeCommand).toHaveBeenCalledWith("colcoor.refreshConversationTree");
  });

  it("shows timeout messaging and refresh actions for HTTP 408", async () => {
    showErrorMessage.mockResolvedValue(undefined);
    const e = new ColcoorApiHttpError("get tree", 408, "{}");
    await showColcoorApiFailure(e);
    expect(showErrorMessage).toHaveBeenCalledWith(
      expect.stringContaining("timed out"),
      COLOOR_API_FAILURE_REFRESH_CONVERSATIONS_ACTION,
      COLOOR_API_FAILURE_REFRESH_CONVERSATION_TREE_ACTION,
    );
  });

  it("runs refresh when user picks an action on HTTP 408", async () => {
    showErrorMessage.mockResolvedValue(COLOOR_API_FAILURE_REFRESH_CONVERSATIONS_ACTION);
    await showColcoorApiFailure(new ColcoorApiHttpError("x", 408, ""));
    expect(executeCommand).toHaveBeenCalledWith("colcoor.refreshConversations");
  });

  it("shows rate limit messaging and refresh actions for HTTP 429", async () => {
    showErrorMessage.mockResolvedValue(undefined);
    await showColcoorApiFailure(new ColcoorApiHttpError("send", 429, "{}"));
    expect(showErrorMessage).toHaveBeenCalledWith(
      expect.stringContaining("rate limited"),
      COLOOR_API_FAILURE_REFRESH_CONVERSATIONS_ACTION,
      COLOOR_API_FAILURE_REFRESH_CONVERSATION_TREE_ACTION,
    );
  });

  it("runs refresh conversation tree when user picks that action on HTTP 429", async () => {
    showErrorMessage.mockResolvedValue(COLOOR_API_FAILURE_REFRESH_CONVERSATION_TREE_ACTION);
    await showColcoorApiFailure(new ColcoorApiHttpError("x", 429, ""));
    expect(executeCommand).toHaveBeenCalledWith("colcoor.refreshConversationTree");
  });

  it("shows bad gateway messaging and refresh actions for HTTP 502", async () => {
    showErrorMessage.mockResolvedValue(undefined);
    const e = new ColcoorApiHttpError("get", 502, "{}");
    await showColcoorApiFailure(e);
    expect(showErrorMessage).toHaveBeenCalledWith(
      expect.stringContaining("bad gateway"),
      COLOOR_API_FAILURE_REFRESH_CONVERSATIONS_ACTION,
      COLOOR_API_FAILURE_REFRESH_CONVERSATION_TREE_ACTION,
    );
    const [text] = showErrorMessage.mock.calls[0] as [string];
    expect(text).toContain(e.message);
    expect(text).toContain("backend URL");
  });

  it("runs refresh when user picks an action on HTTP 502", async () => {
    showErrorMessage.mockResolvedValue(COLOOR_API_FAILURE_REFRESH_CONVERSATIONS_ACTION);
    await showColcoorApiFailure(new ColcoorApiHttpError("x", 502, ""));
    expect(executeCommand).toHaveBeenCalledWith("colcoor.refreshConversations");
  });

  it("shows service unavailable messaging and refresh actions for HTTP 503", async () => {
    showErrorMessage.mockResolvedValue(undefined);
    await showColcoorApiFailure(new ColcoorApiHttpError("send", 503, "{}"));
    expect(showErrorMessage).toHaveBeenCalledWith(
      expect.stringContaining("service unavailable"),
      COLOOR_API_FAILURE_REFRESH_CONVERSATIONS_ACTION,
      COLOOR_API_FAILURE_REFRESH_CONVERSATION_TREE_ACTION,
    );
  });

  it("shows gateway timeout messaging and refresh actions for HTTP 504", async () => {
    showErrorMessage.mockResolvedValue(undefined);
    await showColcoorApiFailure(new ColcoorApiHttpError("x", 504, "{}"));
    expect(showErrorMessage).toHaveBeenCalledWith(
      expect.stringContaining("gateway timeout"),
      COLOOR_API_FAILURE_REFRESH_CONVERSATIONS_ACTION,
      COLOOR_API_FAILURE_REFRESH_CONVERSATION_TREE_ACTION,
    );
  });
});
