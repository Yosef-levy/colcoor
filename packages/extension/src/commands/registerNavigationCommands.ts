import * as vscode from "vscode";
import type { RevealAtEventPrefetchOptions } from "../conversation/conversationPanel";
import { shortStarredEventLabel, starredTreeEvents } from "../conversation/starredTreeEvents";
import {
  type ConversationCommandArg,
  conversationDisplayTitleFromCommandArg,
  conversationIdFromCommandArg,
} from "../conversations/conversationCommandArg";
import { filterTodoNotes } from "../notes/todoNotesFilter";
import { conversationIdAndTitleFromOpenSideChatArg } from "../sidechat/openSideChatCommandArg";
import { showColcoorApiFailure } from "../util/showColcoorApiFailure";
import type { ColcoorExtensionDeps } from "../activation/colcoorExtensionDeps";

/** Same conv payload shape as other conversation-scoped commands (sidebar tree item or `{ conv }`). */
type OpenSideChatCommandArg = ConversationCommandArg;

export function registerNavigationCommands(deps: ColcoorExtensionDeps): vscode.Disposable[] {
  const {
    api,
    localMode,
    conversationPanel,
    isReady,
    pickConversationInteractively,
    notifyCollaborationDisabledInLocalMode,
  } = deps;
  return [
    vscode.commands.registerCommand(
      "colcoor.openSideChat",
      async (item?: OpenSideChatCommandArg) => {
        if (localMode) {
          await notifyCollaborationDisabledInLocalMode("side chat");
          return;
        }
        if (!(await isReady())) {
          await vscode.window.showWarningMessage("Colcoor: sign in first (Colcoor: Sign in).");
          return;
        }
        const picked = conversationIdAndTitleFromOpenSideChatArg(item);
        let convId = picked.convId;
        let convTitle: string | null | undefined = picked.convTitle;
        if (!convId) {
          const row = await pickConversationInteractively();
          if (!row) {
            return;
          }
          convId = row.id;
          convTitle = row.title;
        }
        try {
          await conversationPanel.reveal(convId, convTitle ?? null);
          await conversationPanel.openInlineSideChat();
        } catch (e) {
          await showColcoorApiFailure(e);
        }
      },
    ),
    vscode.commands.registerCommand(
      "colcoor.listTodoNotesInConversation",
      async (item?: ConversationCommandArg) => {
        if (!(await isReady())) {
          await vscode.window.showWarningMessage("Colcoor: sign in first (Colcoor: Sign in).");
          return;
        }
        let convId = conversationIdFromCommandArg(item);
        let convTitle: string | null | undefined = conversationDisplayTitleFromCommandArg(item);
        if (!convId) {
          const row = await pickConversationInteractively();
          if (!row) {
            return;
          }
          convId = row.id;
          convTitle = row.title;
        }
        try {
          const [{ events }, notes] = await Promise.all([api.getTree(convId), api.listNotes(convId)]);
          const visibleEventIds = new Set(events.map((e) => e.id));
          const todos = filterTodoNotes(notes).filter((n) => visibleEventIds.has(n.event_id));
          if (todos.length === 0) {
            await vscode.window.showInformationMessage(
              "Colcoor: no TODO notes in this conversation (first line must start with “TODO”).",
            );
            return;
          }
          type TodoPick = vscode.QuickPickItem & { eventId: string };
          const picked = await vscode.window.showQuickPick<TodoPick>(
            todos.map((n) => {
              const head = n.content.replace(/\r\n/g, "\n").split("\n")[0]?.trim() || "(TODO note)";
              const label = head.length > 72 ? `${head.slice(0, 72)}…` : head;
              return {
                label,
                description: n.event_id,
                detail: n.id,
                eventId: n.event_id,
              };
            }),
            {
              title: "Colcoor — TODO notes",
              placeHolder: "Pick a note to open its host message in the conversation panel",
            },
          );
          if (!picked) {
            return;
          }
          const prefetch: RevealAtEventPrefetchOptions = {
            prefetchedTreeEvents: events,
            prefetchedNotes: notes,
          };
          await conversationPanel.revealAtEvent(convId, convTitle ?? null, picked.eventId, prefetch);
        } catch (e) {
          await showColcoorApiFailure(e);
        }
      },
    ),
    vscode.commands.registerCommand(
      "colcoor.listStarredMessagesInConversation",
      async (item?: ConversationCommandArg) => {
        if (!(await isReady())) {
          await vscode.window.showWarningMessage("Colcoor: sign in first (Colcoor: Sign in).");
          return;
        }
        let convId = conversationIdFromCommandArg(item);
        let convTitle: string | null | undefined = conversationDisplayTitleFromCommandArg(item);
        if (!convId) {
          const row = await pickConversationInteractively();
          if (!row) {
            return;
          }
          convId = row.id;
          convTitle = row.title;
        }
        try {
          const { events } = await api.getTree(convId);
          const starred = [...starredTreeEvents(events)].sort(
            (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at),
          );
          if (starred.length === 0) {
            await vscode.window.showInformationMessage(
              "Colcoor: no starred messages in this conversation.",
            );
            return;
          }
          type StarPick = vscode.QuickPickItem & { eventId: string };
          const picked = await vscode.window.showQuickPick<StarPick>(
            starred.map((e) => {
              const lab = shortStarredEventLabel(e);
              const label = lab.length > 80 ? `${lab.slice(0, 80)}…` : lab;
              return {
                label,
                description: e.id,
                detail: e.kind,
                eventId: e.id,
              };
            }),
            {
              title: "Colcoor — starred messages",
              placeHolder: "Pick a message to open it in the conversation panel",
            },
          );
          if (!picked) {
            return;
          }
          await conversationPanel.revealAtEvent(convId, convTitle ?? null, picked.eventId, {
            prefetchedTreeEvents: events,
          });
        } catch (e) {
          await showColcoorApiFailure(e);
        }
      },
    ),
    vscode.commands.registerCommand("colcoor.referenceSelectedMessageInSideChat", async () => {
      const ctx = conversationPanel.getSelectedMessageContext();
      if (!ctx) {
        await vscode.window.showWarningMessage(
          "Colcoor: open a conversation and select a message first.",
        );
        return;
      }
      try {
        await conversationPanel.reveal(ctx.conversationId, ctx.title ?? null);
        conversationPanel.queueSideChatGraphReferenceForNextSend(ctx.selectedEventId, null);
        await conversationPanel.openInlineSideChat();
      } catch (e) {
        await showColcoorApiFailure(e);
      }
    }),
    vscode.commands.registerCommand("colcoor.referenceSelectedNoteInSideChat", async () => {
      const ctx = conversationPanel.getSelectedMessageContext();
      if (!ctx) {
        await vscode.window.showWarningMessage(
          "Colcoor: open a conversation and select a message first.",
        );
        return;
      }
      try {
        let notesForPick;
        if (ctx.cachedNotesForConversation !== undefined) {
          notesForPick = [...ctx.cachedNotesForConversation];
        } else {
          notesForPick = await api.listNotes(ctx.conversationId);
        }
        const forSelected = notesForPick.filter((n) => n.event_id === ctx.selectedEventId);
        if (forSelected.length === 0) {
          await vscode.window.showWarningMessage(
            "Colcoor: selected message has no notes to reference.",
          );
          return;
        }
        const pick = await vscode.window.showQuickPick(
          forSelected.map((n) => ({
            label: n.content.split("\n")[0]?.trim() || "(empty note)",
            description: n.id,
            nid: n.id,
          })),
          { title: "Colcoor — reference note in side chat", placeHolder: "Choose a note" },
        );
        if (!pick) {
          return;
        }
        const noteId =
          typeof (pick as { nid?: string }).nid === "string" && (pick as { nid: string }).nid.trim()
            ? (pick as { nid: string }).nid.trim()
            : typeof pick.description === "string"
              ? pick.description.trim()
              : "";
        await conversationPanel.revealAtEvent(ctx.conversationId, ctx.title ?? null, ctx.selectedEventId, {
          prefetchedNotes: notesForPick,
        });
        conversationPanel.queueSideChatGraphReferenceForNextSend(ctx.selectedEventId, noteId || null);
        await conversationPanel.openInlineSideChat();
      } catch (e) {
        await showColcoorApiFailure(e);
      }
    }),
  ];
}
