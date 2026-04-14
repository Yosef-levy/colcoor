import { describe, expect, it } from "vitest";

import {
  COLOOR_API_FAILURE_OPEN_ABOUT_ACTION,
  COLOOR_API_FAILURE_OPEN_SETTINGS_ACTION,
  COLOOR_API_FAILURE_REFRESH_CONVERSATION_TREE_ACTION,
  COLOOR_API_FAILURE_REFRESH_CONVERSATIONS_ACTION,
  COLOOR_API_FAILURE_SIGN_IN_ACTION,
} from "./colcoorApiFailureActions";

describe("colcoorApiFailureActions", () => {
  it("uses Colcoor-prefixed labels suitable for toast buttons", () => {
    expect(COLOOR_API_FAILURE_OPEN_SETTINGS_ACTION).toMatch(/^Colcoor:/);
    expect(COLOOR_API_FAILURE_OPEN_ABOUT_ACTION).toMatch(/^Colcoor:/);
    expect(COLOOR_API_FAILURE_SIGN_IN_ACTION).toMatch(/^Colcoor:/);
    expect(COLOOR_API_FAILURE_REFRESH_CONVERSATIONS_ACTION).toMatch(/^Colcoor:/);
    expect(COLOOR_API_FAILURE_REFRESH_CONVERSATION_TREE_ACTION).toMatch(/^Colcoor:/);
  });
});
