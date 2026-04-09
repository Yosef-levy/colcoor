/**
 * Invokes the Cursor agent with Colcoor's authoritative transcript + user message.
 * Prefer CLI/ACP when available; Composer as fallback (docs/data-flow-and-api.md §3).
 */
export class AgentRunner {
  async run(input: {
    transcriptText: string;
    userMessage: string;
    workspaceRoot: string;
  }): Promise<{ text: string }> {
    void input;
    throw new Error("AgentRunner not implemented — wire CLI/ACP or Cursor-native fallback.");
  }
}
