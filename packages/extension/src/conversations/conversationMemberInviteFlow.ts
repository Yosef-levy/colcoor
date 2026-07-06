import * as vscode from "vscode";

import type { ColcoorClient, MemberInviteSearchCandidate } from "../api/client";
import {
  normalizeMemberInviteLookupQuery,
  validateMemberInviteLookupQuery,
} from "./conversationMemberInvite";
import {
  formatInviteSuccessMessage,
  showInviteApiFailure,
  showInviteSearchNoMatchMessage,
} from "./inviteApiErrors";

function formatMemberLastLogin(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return iso;
  }
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function candidateQuickPickRow(
  c: MemberInviteSearchCandidate,
): vscode.QuickPickItem & { candidate: MemberInviteSearchCandidate } {
  const name = (c.display_name && c.display_name.trim()) || "(no display name)";
  const handlePart = c.handle ? `@${c.handle}` : "No @handle";
  const last = formatMemberLastLogin(c.last_login_at);
  const iconPath =
    c.avatar_url && /^https:\/\//i.test(c.avatar_url) ? vscode.Uri.parse(c.avatar_url) : undefined;
  return {
    label: name,
    description: `${handlePart} · ${c.email}`,
    detail: `Last signed in: ${last} · ${c.user_id}`,
    iconPath,
    candidate: c,
  };
}

/**
 * Prompt for email / @handle / UUID, resolve via `member-invite-search`, disambiguate in a QuickPick
 * when needed, then add the member with the chosen role.
 */
export async function runAddConversationMemberFlow(
  api: ColcoorClient,
  conversationId: string,
  refreshTree: () => void,
): Promise<void> {
  const rawQuery = await vscode.window.showInputBox({
    title: "Colcoor — add member",
    prompt: "Colcoor user id (UUID), full email, or @handle. They must have signed in once.",
    ignoreFocusOut: true,
    validateInput: (v) => validateMemberInviteLookupQuery(v),
  });
  if (rawQuery === undefined) {
    return;
  }
  const q = normalizeMemberInviteLookupQuery(rawQuery);
  if (!q) {
    return;
  }

  let candidates: MemberInviteSearchCandidate[];
  try {
    candidates = await api.searchConversationMemberInviteCandidates(conversationId, q);
  } catch (e) {
    await showInviteApiFailure(e);
    return;
  }

  if (candidates.length === 0) {
    await showInviteSearchNoMatchMessage(q);
    return;
  }

  let chosen: MemberInviteSearchCandidate;
  if (candidates.length === 1) {
    chosen = candidates[0];
  } else {
    type Row = vscode.QuickPickItem & { candidate: MemberInviteSearchCandidate };
    const picked = await vscode.window.showQuickPick<Row>(
      candidates.map((c) => candidateQuickPickRow(c)),
      {
        title: "Colcoor — several accounts match; pick who to invite",
        matchOnDescription: true,
        matchOnDetail: true,
      },
    );
    if (!picked?.candidate) {
      return;
    }
    chosen = picked.candidate;
  }

  const rolePick = await vscode.window.showQuickPick(
    [
      { label: "Editor", role: "editor" as const },
      { label: "Viewer", role: "viewer" as const },
    ],
    { title: "Colcoor — member role", placeHolder: "Editor can post; viewer is read-only" },
  );
  if (!rolePick) {
    return;
  }

  try {
    await api.postConversationMember(conversationId, { user_id: chosen.user_id, role: rolePick.role });
    refreshTree();
    await vscode.window.showInformationMessage(
      formatInviteSuccessMessage(chosen.display_name, chosen.email, rolePick.role),
    );
  } catch (e) {
    await showInviteApiFailure(e);
  }
}
