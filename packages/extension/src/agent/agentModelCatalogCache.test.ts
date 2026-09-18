import * as vscode from "vscode";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  getAgentModelCatalog,
  refreshAgentModelCatalog,
} from "./agentModelCatalogCache";
import { ANTHROPIC_PROVIDER_MODELS } from "./providerModelCatalog";

vi.mock("vscode", () => ({
  workspace: {
    getConfiguration: vi.fn(),
  },
}));

vi.mock("./cursorAgentModels", () => ({
  listCursorAgentModels: vi.fn(),
}));

vi.mock("./providerApiKey", () => ({
  resolveProviderId: vi.fn(),
}));

import { listCursorAgentModels } from "./cursorAgentModels";
import { resolveProviderId } from "./providerApiKey";

const getConfiguration = vi.mocked(vscode.workspace.getConfiguration);
const listModels = vi.mocked(listCursorAgentModels);
const providerId = vi.mocked(resolveProviderId);

describe("agentModelCatalogCache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getConfiguration.mockReturnValue({
      get: (key: string) => {
        if (key === "agentMode") return "auto";
        if (key === "agentExecutable") return "agent";
        return undefined;
      },
    } as vscode.WorkspaceConfiguration);
  });

  it("loads Anthropic provider models when provider is not cursor", async () => {
    providerId.mockReturnValue("anthropic");
    await refreshAgentModelCatalog({ get: vi.fn() } as unknown as vscode.SecretStorage);
    expect(getAgentModelCatalog().all).toEqual(ANTHROPIC_PROVIDER_MODELS);
    expect(listModels).not.toHaveBeenCalled();
  });

  it("loads Cursor CLI models when provider is cursor", async () => {
    providerId.mockReturnValue("cursor");
    listModels.mockResolvedValue({
      stdout: "gpt-5.2 - GPT-5.2\n",
      stderr: "",
      exitCode: 0,
    });
    await refreshAgentModelCatalog({ get: vi.fn() } as unknown as vscode.SecretStorage);
    expect(getAgentModelCatalog().all).toEqual([{ id: "gpt-5.2", label: "GPT-5.2" }]);
  });
});
