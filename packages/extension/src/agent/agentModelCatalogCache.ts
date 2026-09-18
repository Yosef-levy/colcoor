import * as vscode from "vscode";

import { SECRET_CURSOR_AGENT_API_KEY } from "./cursorAgentApiKey";
import {
  curateAgentModelsForComposer,
  parseCursorAgentModelsStdout,
  type CursorAgentModelEntry,
} from "./cursorAgentModelCatalog";
import { listCursorAgentModels } from "./cursorAgentModels";
import { providerModelCatalogSnapshot } from "./providerModelCatalog";
import { resolveProviderId } from "./providerApiKey";

export type AgentModelCatalogSnapshot = {
  curated: CursorAgentModelEntry[];
  all: CursorAgentModelEntry[];
  hint: string | null;
};

let snapshot: AgentModelCatalogSnapshot = {
  curated: [],
  all: [],
  hint: null,
};

let refreshInFlight: Promise<void> | undefined;

export function getAgentModelCatalog(): AgentModelCatalogSnapshot {
  return snapshot;
}

/** Load Cursor CLI models or the active provider's catalog for the composer. */
export async function refreshAgentModelCatalog(secrets: vscode.SecretStorage): Promise<void> {
  const cfg = vscode.workspace.getConfiguration("colcoor");
  const provider = resolveProviderId();
  const mode = cfg.get<string>("agentMode") ?? "auto";
  if (mode === "stub") {
    snapshot = {
      curated: [],
      all: [],
      hint: "Agent mode is stub — model list unavailable.",
    };
    return;
  }
  if (provider !== "cursor") {
    snapshot = providerModelCatalogSnapshot(provider);
    return;
  }
  const executable = (cfg.get<string>("agentExecutable") ?? "agent").trim() || "agent";
  const storedKey = (await secrets.get(SECRET_CURSOR_AGENT_API_KEY))?.trim();
  const { stdout, stderr, exitCode } = await listCursorAgentModels({
    executable,
    storedCursorApiKey: storedKey || undefined,
  });
  const parsed = parseCursorAgentModelsStdout(stdout);
  const all = parsed.filter((e) => e.id !== "auto");
  const curated = curateAgentModelsForComposer(parsed);
  if (all.length > 0) {
    snapshot = { curated, all, hint: null };
    return;
  }
  if (exitCode !== 0) {
    snapshot = {
      curated: [],
      all: [],
      hint: stderr.trim() || "`agent models` failed — check Cursor CLI install and API key.",
    };
    return;
  }
  snapshot = {
    curated: [],
    all: [],
    hint: stderr.trim() || "No models returned for this account — Auto is still available.",
  };
}

export function scheduleRefreshAgentModelCatalog(
  secrets: vscode.SecretStorage,
  onSettled?: () => void,
): void {
  if (refreshInFlight) {
    void refreshInFlight.finally(() => onSettled?.());
    return;
  }
  refreshInFlight = refreshAgentModelCatalog(secrets)
    .catch(() => {
      snapshot = {
        curated: [],
        all: [],
        hint:
          resolveProviderId() === "cursor"
            ? "Could not list Cursor CLI models."
            : "Could not load provider models.",
      };
    })
    .finally(() => {
      refreshInFlight = undefined;
      onSettled?.();
    });
}

export function refreshAgentModelCatalogWhenSignedIn(
  secrets: vscode.SecretStorage,
  hasBackendJwt: boolean,
): void {
  if (resolveProviderId() !== "cursor") {
    scheduleRefreshAgentModelCatalog(secrets);
    return;
  }
  if (!hasBackendJwt) {
    snapshot = { curated: [], all: [], hint: null };
    return;
  }
  scheduleRefreshAgentModelCatalog(secrets);
}
