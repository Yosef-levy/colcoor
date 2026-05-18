import { describe, expect, it } from "vitest";

import { GETTING_STARTED_LINES, TRY_THIS_NEXT_STEPS, WEBVIEW_EMPTY_COPY } from "./emptyStateCopy";

describe("emptyStateCopy", () => {
  it("uses plain product language without technical jargon", () => {
    const joined = JSON.stringify(WEBVIEW_EMPTY_COPY) + GETTING_STARTED_LINES.join(" ");
    expect(joined).not.toMatch(/event graph|deterministic context/i);
    expect(joined).toMatch(/branch|collaborator|side chat/i);
  });

  it("defines three try-this-next steps", () => {
    expect(TRY_THIS_NEXT_STEPS.map((s) => s.id)).toEqual(["invite", "branch", "sideChat"]);
  });
});
