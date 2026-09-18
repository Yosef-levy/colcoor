import type {
  ListProposal,
  ListProposalRepair,
  ListProposalsFile,
  LiteEvent,
  StructuralFailureReason,
  VerifiedProposalRow,
} from "./types";

/** Match list-create normalization in conversation_lists._normalize_selected_text. */
export function normalizeSelectedText(selectedText: string): string {
  const text = (selectedText || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  return text;
}

function findOccurrenceOffsets(
  content: string,
  needle: string,
  occurrenceIndex: number,
): { start: number; end: number } | null {
  if (!needle) return null;
  let from = 0;
  let found = -1;
  let idx = 0;
  while (from <= content.length) {
    const at = content.indexOf(needle, from);
    if (at < 0) break;
    if (idx === occurrenceIndex) {
      found = at;
      break;
    }
    idx += 1;
    from = at + Math.max(1, needle.length);
  }
  if (found < 0) return null;
  return { start: found, end: found + needle.length };
}

export function verifyProposal(
  proposal: ListProposal,
  eventsById: Map<string, LiteEvent>,
): VerifiedProposalRow {
  if (
    !proposal.proposal_id ||
    !proposal.event_id ||
    typeof proposal.selected_text !== "string" ||
    typeof proposal.reason !== "string" ||
    !Number.isFinite(proposal.occurrence_index)
  ) {
    return { proposal, status: "invalid", failure_reason: "missing_fields" };
  }

  const ev = eventsById.get(proposal.event_id);
  if (!ev) {
    return { proposal, status: "invalid", failure_reason: "unknown_event_id" };
  }

  const needle = normalizeSelectedText(proposal.selected_text);
  if (!needle) {
    return { proposal, status: "invalid", failure_reason: "text_not_found" };
  }

  const occ = Math.max(0, Math.floor(proposal.occurrence_index));
  const offsets = findOccurrenceOffsets(ev.content, needle, occ);
  if (!offsets) {
    // Distinguish bad occurrence vs not found at all
    const any = findOccurrenceOffsets(ev.content, needle, 0);
    const reason: StructuralFailureReason = any ? "bad_occurrence" : "text_not_found";
    return { proposal, status: "invalid", failure_reason: reason };
  }

  return {
    proposal: { ...proposal, selected_text: needle, occurrence_index: occ },
    status: "verified",
    text_start: offsets.start,
    text_end: offsets.end,
  };
}

export function verifyProposalsFile(
  file: ListProposalsFile,
  events: LiteEvent[],
): VerifiedProposalRow[] {
  const byId = new Map(events.map((e) => [e.id, e]));
  const items = Array.isArray(file.items) ? file.items : [];
  return items.map((p) => verifyProposal(p, byId));
}

/** Apply repair results onto prior rows; only failed proposal_ids may change. */
export function applyRepairs(
  prior: VerifiedProposalRow[],
  repairs: ListProposalRepair[],
  events: LiteEvent[],
): { rows: VerifiedProposalRow[]; error: string | null } {
  const byId = new Map(events.map((e) => [e.id, e]));
  const failedIds = new Set(
    prior.filter((r) => r.status === "invalid").map((r) => r.proposal.proposal_id),
  );
  const repairById = new Map<string, ListProposalRepair>();
  for (const r of repairs) {
    if (!r.proposal_id) {
      return { rows: prior, error: "repair missing proposal_id" };
    }
    if (!failedIds.has(r.proposal_id)) {
      return {
        rows: prior,
        error: `repair for non-failed or unknown proposal_id ${r.proposal_id}`,
      };
    }
    if (repairById.has(r.proposal_id)) {
      return { rows: prior, error: `duplicate repair for ${r.proposal_id}` };
    }
    repairById.set(r.proposal_id, r);
  }
  for (const id of failedIds) {
    if (!repairById.has(id)) {
      return { rows: prior, error: `missing repair for ${id}` };
    }
  }

  const rows = prior.map((row) => {
    if (row.status !== "invalid") return row;
    const rep = repairById.get(row.proposal.proposal_id)!;
    if (rep.dismiss) {
      return {
        proposal: row.proposal,
        status: "dismissed" as const,
      };
    }
    const next: ListProposal = {
      proposal_id: row.proposal.proposal_id,
      event_id: rep.event_id ?? row.proposal.event_id,
      selected_text: rep.selected_text ?? row.proposal.selected_text,
      occurrence_index:
        typeof rep.occurrence_index === "number"
          ? rep.occurrence_index
          : row.proposal.occurrence_index,
      reason: row.proposal.reason,
    };
    return verifyProposal(next, byId);
  });
  return { rows, error: null };
}

export function buildRepairPromptPayload(
  failed: VerifiedProposalRow[],
  events: LiteEvent[],
): {
  repairs_needed: Array<{
    proposal_id: string;
    failure_reason: StructuralFailureReason | undefined;
    previous: ListProposal;
  }>;
  events: LiteEvent[];
} {
  const byId = new Map(events.map((e) => [e.id, e]));
  const neededEvents = new Map<string, LiteEvent>();
  const repairs_needed = failed.map((f) => {
    const ev = byId.get(f.proposal.event_id);
    if (ev) neededEvents.set(ev.id, ev);
    return {
      proposal_id: f.proposal.proposal_id,
      failure_reason: f.failure_reason,
      previous: f.proposal,
    };
  });
  return { repairs_needed, events: [...neededEvents.values()] };
}

export function allStructurallySettled(rows: VerifiedProposalRow[]): boolean {
  return rows.every((r) => r.status === "verified" || r.status === "dismissed");
}

export function structurallyVerifiedRows(rows: VerifiedProposalRow[]): VerifiedProposalRow[] {
  return rows.filter((r) => r.status === "verified");
}
