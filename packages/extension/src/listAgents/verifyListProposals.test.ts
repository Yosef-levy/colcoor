import { describe, expect, it } from "vitest";

import { buildListItemAnchor } from "./buildListItemAnchor";
import type { ListProposal, LiteEvent } from "./types";
import {
  applyRepairs,
  buildRepairPromptPayload,
  verifyProposal,
  verifyProposalsFile,
} from "./verifyListProposals";

const events: LiteEvent[] = [
  {
    id: "e1",
    parent_event_id: null,
    kind: "user_input",
    actor_user_id: "u",
    content: "alpha beta alpha gamma",
  },
];

function prop(partial: Partial<ListProposal> & Pick<ListProposal, "proposal_id">): ListProposal {
  return {
    event_id: "e1",
    selected_text: "alpha",
    occurrence_index: 0,
    reason: "match",
    ...partial,
  };
}

describe("verifyListProposals", () => {
  it("accepts exact text and occurrence index", () => {
    const ok = verifyProposal(prop({ proposal_id: "p_0001", occurrence_index: 1 }), new Map([["e1", events[0]]]));
    expect(ok.status).toBe("verified");
    expect(ok.text_start).toBe(11);
  });

  it("fails missing event, text not found, bad occurrence", () => {
    const byId = new Map([["e1", events[0]]]);
    expect(verifyProposal(prop({ proposal_id: "p1", event_id: "nope" }), byId).failure_reason).toBe(
      "unknown_event_id",
    );
    expect(
      verifyProposal(prop({ proposal_id: "p2", selected_text: "zzz" }), byId).failure_reason,
    ).toBe("text_not_found");
    expect(
      verifyProposal(prop({ proposal_id: "p3", occurrence_index: 9 }), byId).failure_reason,
    ).toBe("bad_occurrence");
  });

  it("keeps stable proposal_id through repair and rejects unrelated adds", () => {
    const rows = verifyProposalsFile(
      {
        items: [
          prop({ proposal_id: "p_0001", selected_text: "nope" }),
          prop({ proposal_id: "p_0002", selected_text: "beta" }),
        ],
      },
      events,
    );
    expect(rows[0].status).toBe("invalid");
    expect(rows[1].status).toBe("verified");

    const bad = applyRepairs(
      rows,
      [{ proposal_id: "p_0001", dismiss: false, selected_text: "alpha" }, { proposal_id: "p_new", dismiss: false }],
      events,
    );
    expect(bad.error).toMatch(/non-failed|unknown/);

    const ok = applyRepairs(
      rows,
      [{ proposal_id: "p_0001", dismiss: false, selected_text: "alpha", occurrence_index: 0 }],
      events,
    );
    expect(ok.error).toBeNull();
    expect(ok.rows[0].status).toBe("verified");
    expect(ok.rows[0].proposal.proposal_id).toBe("p_0001");
    expect(ok.rows[1].status).toBe("verified");
  });

  it("handles dismiss: true", () => {
    const rows = verifyProposalsFile(
      { items: [prop({ proposal_id: "p_0001", selected_text: "nope" })] },
      events,
    );
    const applied = applyRepairs(rows, [{ proposal_id: "p_0001", dismiss: true }], events);
    expect(applied.rows[0].status).toBe("dismissed");
  });

  it("repair payload includes only failed proposals and their events", () => {
    const rows = verifyProposalsFile(
      {
        items: [
          prop({ proposal_id: "p_0001", selected_text: "nope" }),
          prop({ proposal_id: "p_0002", selected_text: "beta" }),
        ],
      },
      events,
    );
    const payload = buildRepairPromptPayload(
      rows.filter((r) => r.status === "invalid"),
      events,
    );
    expect(payload.repairs_needed.map((r) => r.proposal_id)).toEqual(["p_0001"]);
    expect(payload.events.map((e) => e.id)).toEqual(["e1"]);
  });

  it("builds extension anchors from verified offsets", () => {
    const a = buildListItemAnchor("hello world", 6, 11, 0);
    expect(a.kind).toBe("message_text_range");
    expect(a.exact).toBe("world");
    expect(a.textStart).toBe(6);
  });
});
