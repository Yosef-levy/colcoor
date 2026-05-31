/** Gate Cursor CLI child spawns per workspace to avoid resume/session overlap. */

type WorkspaceCliGate = {
  activeSpawns: number;
  idleWaiters: Array<() => void>;
};

const gatesByWorkspace = new Map<string, WorkspaceCliGate>();

function gateForWorkspace(workspaceRoot: string): WorkspaceCliGate {
  const key = workspaceRoot.trim() || process.cwd();
  let gate = gatesByWorkspace.get(key);
  if (!gate) {
    gate = { activeSpawns: 0, idleWaiters: [] };
    gatesByWorkspace.set(key, gate);
  }
  return gate;
}

function notifyIdleWaiters(gate: WorkspaceCliGate): void {
  if (gate.activeSpawns > 0) {
    return;
  }
  const waiters = gate.idleWaiters.splice(0);
  for (const wake of waiters) {
    wake();
  }
}

export function waitUntilWorkspaceCliIdle(workspaceRoot: string): Promise<void> {
  const gate = gateForWorkspace(workspaceRoot);
  if (gate.activeSpawns <= 0) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    gate.idleWaiters.push(resolve);
  });
}

/** Track one Cursor CLI child for this workspace; resume spawns wait until idle first. */
export async function withWorkspaceAgentSpawn<T>(
  workspaceRoot: string,
  options: { resume: boolean },
  fn: () => Promise<T>,
): Promise<T> {
  const gate = gateForWorkspace(workspaceRoot);
  if (options.resume) {
    await waitUntilWorkspaceCliIdle(workspaceRoot);
  }
  gate.activeSpawns += 1;
  try {
    return await fn();
  } finally {
    gate.activeSpawns -= 1;
    notifyIdleWaiters(gate);
  }
}

/** @internal Test helper. */
export function resetWorkspaceAgentLocksForTests(): void {
  gatesByWorkspace.clear();
}
