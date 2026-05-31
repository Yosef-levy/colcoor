import type { ToolApprovalDecision } from "./cursorToolCallApproval";

let approvalChain: Promise<unknown> = Promise.resolve();

/** Run one tool-approval modal at a time so parallel agent runs cannot interleave prompts. */
export function enqueueToolCallApproval(
  fn: () => Promise<ToolApprovalDecision>,
): Promise<ToolApprovalDecision> {
  const run = approvalChain.then(fn, fn);
  approvalChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/** @internal Test helper. */
export function resetToolCallApprovalQueueForTests(): void {
  approvalChain = Promise.resolve();
}
