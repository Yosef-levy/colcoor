import { describe, expect, it, vi } from "vitest";

import { ColcoorApiHttpError } from "../api/colcoorApiHttpError";
import { reportSideChatPanelApiError } from "./reportSideChatPanelApiError";

describe("reportSideChatPanelApiError", () => {
  it("calls host failure then webview hint for HTTP 402", async () => {
    const showHostFailure = vi.fn().mockResolvedValue(undefined);
    const postWebviewError = vi.fn().mockResolvedValue(undefined);
    const e = new ColcoorApiHttpError("post side chat", 402, "{}");
    await reportSideChatPanelApiError(e, { showHostFailure, postWebviewError });
    expect(showHostFailure).toHaveBeenCalledTimes(1);
    expect(showHostFailure).toHaveBeenCalledWith(e);
    expect(postWebviewError).toHaveBeenCalledTimes(1);
    expect(postWebviewError.mock.calls[0][0]).toContain("Plan or usage limit");
  });

  it("posts only the error message for non-402 errors", async () => {
    const showHostFailure = vi.fn();
    const postWebviewError = vi.fn().mockResolvedValue(undefined);
    await reportSideChatPanelApiError(new Error("bad request"), { showHostFailure, postWebviewError });
    expect(showHostFailure).not.toHaveBeenCalled();
    expect(postWebviewError).toHaveBeenCalledWith("bad request");
  });
});
