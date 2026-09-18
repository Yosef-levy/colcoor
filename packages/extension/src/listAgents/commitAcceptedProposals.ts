import * as fs from "node:fs/promises";
import * as path from "node:path";

import type { ColcoorClient } from "../api/client";
import { buildListItemAnchor, sourceContentHash } from "./buildListItemAnchor";
import type { ListProposal, VerifiedProposalRow } from "./types";

export type CommitAcceptedOptions = {
  api: ColcoorClient;
  conversationId: string;
  listId: string | null;
  listName: string;
  accepted: VerifiedProposalRow[];
  eventsById: Map<string, { content: string }>;
};

export type CommitAcceptedResult = {
  listId: string;
  itemIds: string[];
};

/** Commit only user-accepted, structurally verified proposals. */
export async function commitAcceptedProposals(
  opts: CommitAcceptedOptions,
): Promise<CommitAcceptedResult> {
  let listId = opts.listId;
  if (!listId) {
    const created = await opts.api.createConversationList(opts.conversationId, {
      name: opts.listName,
      description: "Created by list-builder agent",
    });
    listId = created.id;
  }

  const itemIds: string[] = [];
  for (const row of opts.accepted) {
    // Only commit when caller marked accepted (auto-commit marks verified → accepted first)
    if (row.status !== "accepted") continue;
    if (row.text_start == null || row.text_end == null) {
      throw new Error(`Proposal ${row.proposal.proposal_id} missing verified offsets`);
    }
    const ev = opts.eventsById.get(row.proposal.event_id);
    if (!ev) {
      throw new Error(`Event ${row.proposal.event_id} missing for commit`);
    }
    const anchor_json = buildListItemAnchor(
      ev.content,
      row.text_start,
      row.text_end,
      row.proposal.occurrence_index,
    );
    const item = await opts.api.createConversationListItem(opts.conversationId, listId, {
      event_id: row.proposal.event_id,
      selected_text: row.proposal.selected_text,
      anchor_json,
      source_content_hash: sourceContentHash(ev.content),
    });
    itemIds.push(item.id);
  }
  return { listId, itemIds };
}

export async function writeVerificationArtifacts(
  jobPath: string,
  rows: VerifiedProposalRow[],
): Promise<void> {
  const outDir = path.join(jobPath, "out");
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(
    path.join(outDir, "verification.json"),
    JSON.stringify({ rows }, null, 2) + "\n",
    "utf8",
  );
  const rejected = rows.filter((r) => r.status === "invalid" || r.status === "dismissed");
  await fs.writeFile(
    path.join(outDir, "rejected.json"),
    JSON.stringify({ items: rejected }, null, 2) + "\n",
    "utf8",
  );
  const verified = rows.filter((r) => r.status === "verified" || r.status === "accepted");
  await fs.writeFile(
    path.join(outDir, "proposals.json"),
    JSON.stringify(
      {
        items: verified.map((r) => r.proposal),
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );
}

export function markAccepted(
  rows: VerifiedProposalRow[],
  acceptedIds: Set<string>,
  rejectedIds: Set<string>,
): VerifiedProposalRow[] {
  return rows.map((r) => {
    if (r.status !== "verified") return r;
    if (rejectedIds.has(r.proposal.proposal_id)) {
      return { ...r, status: "rejected" };
    }
    if (acceptedIds.has(r.proposal.proposal_id)) {
      return { ...r, status: "accepted" };
    }
    return r;
  });
}

export function parseProposalsJson(raw: string): ListProposal[] {
  const parsed = JSON.parse(raw) as { items?: ListProposal[] };
  return Array.isArray(parsed.items) ? parsed.items : [];
}
