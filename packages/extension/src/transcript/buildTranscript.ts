/**
 * Deterministic authoritative transcript: root → active node, notes, user message.
 * Must match web semantics (path, needs_context_rebuild, no hidden history) — see docs/principles.md.
 */
export function buildAuthoritativeTranscript(ctx: {
  conversationId: string;
  activeEventId: string;
}): string {
  void ctx;
  throw new Error("buildAuthoritativeTranscript not implemented");
}
