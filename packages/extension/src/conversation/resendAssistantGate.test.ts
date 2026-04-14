import { describe, expect, it } from "vitest";

import { evaluateResendAssistantGate } from "./resendAssistantGate";

describe("evaluateResendAssistantGate", () => {
  const events = [
    { id: "root", kind: "user_input", content_text: "" },
    { id: "u1", kind: "user_input", content_text: "  hi  " },
    { id: "a1", kind: "assistant_output", content_text: "ok" },
  ];

  it("returns no_context when conversation or selection is missing", () => {
    expect(evaluateResendAssistantGate(undefined, "u1", events)).toBe("no_context");
    expect(evaluateResendAssistantGate("c1", undefined, events)).toBe("no_context");
  });

  it("returns not_in_tree when selection is not in events", () => {
    expect(evaluateResendAssistantGate("c1", "x", events)).toBe("not_in_tree");
  });

  it("returns not_user_message for assistant rows", () => {
    expect(evaluateResendAssistantGate("c1", "a1", events)).toBe("not_user_message");
  });

  it("returns empty_user_body for user rows with no text after normalize", () => {
    expect(evaluateResendAssistantGate("c1", "root", events)).toBe("empty_user_body");
  });

  it("returns ok for a non-empty user_input", () => {
    expect(evaluateResendAssistantGate("c1", "u1", events)).toBe("ok");
  });
});
