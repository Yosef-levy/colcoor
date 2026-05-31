import { describe, expect, it } from "vitest";

import {
  enqueueToolCallApproval,
  resetToolCallApprovalQueueForTests,
} from "./cursorToolCallApprovalQueue";

describe("enqueueToolCallApproval", () => {
  it("runs approval prompts one at a time in order", async () => {
    resetToolCallApprovalQueueForTests();
    const order: string[] = [];
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const first = enqueueToolCallApproval(async () => {
      order.push("first-start");
      await firstGate;
      order.push("first-end");
      return "skip";
    });
    const second = enqueueToolCallApproval(async () => {
      order.push("second");
      return "run";
    });

    await Promise.resolve();
    expect(order).toEqual(["first-start"]);

    releaseFirst();
    await Promise.all([first, second]);
    expect(order).toEqual(["first-start", "first-end", "second"]);
  });
});
