import { describe, expect, it } from "vitest";

import {
  resetWorkspaceAgentLocksForTests,
  waitUntilWorkspaceCliIdle,
  withWorkspaceAgentSpawn,
} from "./cursorCliWorkspaceLock";

describe("withWorkspaceAgentSpawn", () => {
  it("allows parallel initial spawns but waits for idle before resume", async () => {
    resetWorkspaceAgentLocksForTests();
    const order: string[] = [];
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const first = withWorkspaceAgentSpawn("/tmp/a", { resume: false }, async () => {
      order.push("first-start");
      await firstGate;
      order.push("first-end");
      return 1;
    });
    const second = withWorkspaceAgentSpawn("/tmp/a", { resume: false }, async () => {
      order.push("second-start");
      order.push("second-end");
      return 2;
    });

    await Promise.resolve();
    expect(order).toContain("first-start");
    expect(order).toContain("second-start");
    expect(order).not.toContain("first-end");

    const resume = withWorkspaceAgentSpawn("/tmp/a", { resume: true }, async () => {
      order.push("resume");
      return 3;
    });
    await Promise.resolve();
    expect(order).not.toContain("resume");

    releaseFirst();
    await Promise.all([first, second, resume]);
    expect(order.indexOf("resume")).toBeGreaterThan(order.indexOf("first-end"));
    expect(order.indexOf("resume")).toBeGreaterThan(order.indexOf("second-end"));
  });

  it("waitUntilWorkspaceCliIdle resolves immediately when no spawns are active", async () => {
    resetWorkspaceAgentLocksForTests();
    await expect(waitUntilWorkspaceCliIdle("/tmp/b")).resolves.toBeUndefined();
  });
});
