/**
 * Invokes the Cursor agent with Colcoor's authoritative transcript + user message.
 * Prefer CLI/ACP when available; Composer as fallback (docs/data-flow-and-api.md §3).
 *
 * Default: **stub** that returns a placeholder assistant body so the append-event
 * pipeline can be exercised end-to-end. Replace `run()` with a real subprocess/API.
 */
export class AgentRunner {
  async run(input: {
    transcriptText: string;
    userMessage: string;
    workspaceRoot: string;
  }): Promise<{ text: string }> {
    void input.workspaceRoot;
    void input.transcriptText;
    return {
      text:
        "[Colcoor stub agent — replace AgentRunner with CLI/ACP.]\n\n" +
        `You wrote:\n${input.userMessage.trim()}`,
    };
  }
}

