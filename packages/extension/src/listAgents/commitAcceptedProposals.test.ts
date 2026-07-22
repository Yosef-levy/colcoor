import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { sha256Hex } from "./buildListItemAnchor";
import { markAccepted } from "./commitAcceptedProposals";
import type { VerifiedProposalRow } from "./types";

describe("commit / review helpers", () => {
  it("does not treat verified as accepted until markAccepted", () => {
    const rows: VerifiedProposalRow[] = [
      {
        proposal: {
          proposal_id: "p_0001",
          event_id: "e1",
          selected_text: "a",
          occurrence_index: 0,
          reason: "r",
        },
        status: "verified",
        text_start: 0,
        text_end: 1,
      },
    ];
    const accepted = markAccepted(rows, new Set(["p_0001"]), new Set());
    expect(accepted[0].status).toBe("accepted");
    const rejected = markAccepted(rows, new Set(), new Set(["p_0001"]));
    expect(rejected[0].status).toBe("rejected");
  });
});

describe("hashing", () => {
  let tmp: string | undefined;
  afterEach(async () => {
    if (tmp) await fs.rm(tmp, { recursive: true, force: true });
  });

  it("is deterministic for the same bytes", async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "colcoor-hash-"));
    const body = "abc\n";
    expect(sha256Hex(body)).toBe(sha256Hex(Buffer.from(body, "utf8")));
    expect(sha256Hex(body)).toBe(sha256Hex(body));
  });
});
