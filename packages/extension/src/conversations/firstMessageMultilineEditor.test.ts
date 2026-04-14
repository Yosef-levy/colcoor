import { describe, expect, it, vi, beforeEach } from "vitest";

const { mockDoc } = vi.hoisted(() => ({
  mockDoc: {
    uri: { toString: () => "untitled:colcoor-draft-test" },
    getText: vi.fn(() => "  hello\nworld  "),
  },
}));

vi.mock("vscode", () => ({
  workspace: {
    openTextDocument: vi.fn().mockResolvedValue(mockDoc),
    get textDocuments() {
      return [mockDoc];
    },
  },
  window: {
    showTextDocument: vi.fn().mockResolvedValue(undefined),
    showInformationMessage: vi.fn(),
  },
}));

import * as vscode from "vscode";
import {
  collectFirstMessageFromUntitledEditor,
  collectMultilineTextInUntitledEditor,
} from "./firstMessageMultilineEditor";

describe("collectMultilineTextInUntitledEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(mockDoc.getText).mockReturnValue("  hello\nworld  ");
  });

  it("uses a modal dialog so confirm/skip is visible", async () => {
    vi.mocked(vscode.window.showInformationMessage).mockResolvedValueOnce("Skip" as never);
    await collectMultilineTextInUntitledEditor({
      infoMessage: "Title line",
      useButtonLabel: "Use",
      dismissButtonLabel: "Skip",
    });
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      "Title line",
      expect.objectContaining({
        modal: true,
        detail: expect.stringContaining("plaintext editor"),
      }),
      "Use",
      "Skip",
    );
  });

  it("returns normalized editor text when user confirms", async () => {
    vi.mocked(vscode.window.showInformationMessage).mockResolvedValueOnce("Use" as never);
    const out = await collectMultilineTextInUntitledEditor({
      infoMessage: "m",
      useButtonLabel: "Use",
      dismissButtonLabel: "Skip",
    });
    expect(out).toBe("hello\nworld");
  });
});

describe("collectFirstMessageFromUntitledEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(mockDoc.getText).mockReturnValue("x");
  });

  it("labels the modal for the new-conversation multiline path", async () => {
    vi.mocked(vscode.window.showInformationMessage).mockResolvedValueOnce("Skip first message" as never);
    await collectFirstMessageFromUntitledEditor();
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      "Colcoor — optional first message (multiline)",
      expect.objectContaining({ modal: true }),
      "Use editor text as first message",
      "Skip first message",
    );
  });
});
