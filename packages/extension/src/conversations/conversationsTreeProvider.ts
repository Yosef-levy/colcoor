import * as vscode from "vscode";
import type { ColcoorClient, ConversationSummary } from "../api/client";
import {
  listConversationsCached,
  listDeletedConversationsCached,
} from "./conversationsListCache";
import { formatConversationUpdatedAtForTooltip } from "./conversationListUpdatedAt";
import { conversationUnreadBadgeInfo } from "./conversationUnreadBadge";
import { formatRelativeTime } from "../util/formatRelativeTime";
import { showColcoorApiFailure } from "../util/showColcoorApiFailure";

export type ConversationsTreeNode = ConversationTreeItem | RecentlyDeletedSectionItem;

export class RecentlyDeletedSectionItem extends vscode.TreeItem {
  readonly kind = "recentlyDeletedSection" as const;

  constructor() {
    super("Recently Deleted", vscode.TreeItemCollapsibleState.Expanded);
    this.id = "colcoor.recentlyDeletedSection";
    this.contextValue = "recentlyDeletedSection";
    this.iconPath = new vscode.ThemeIcon("trash");
    this.tooltip = "Soft-deleted conversations you can restore";
  }
}

export class ConversationTreeItem extends vscode.TreeItem {
  readonly kind = "conversation" as const;

  constructor(
    public readonly conv: ConversationSummary,
    options?: { deleted?: boolean },
  ) {
    const deleted = Boolean(options?.deleted);
    const label = conv.title?.trim() ? conv.title : "(untitled)";
    super(label, vscode.TreeItemCollapsibleState.None);
    this.id = deleted ? `deleted:${conv.id}` : conv.id;
    const rel = deleted
      ? conv.deleted_at
        ? formatRelativeTime(conv.deleted_at)
        : ""
      : conv.updated_at
        ? formatRelativeTime(conv.updated_at)
        : "";
    const pinPart = !deleted && conv.pinned ? "Pinned · " : "";
    const unread = deleted
      ? { descriptionPrefix: "", tooltipSuffix: "" }
      : conversationUnreadBadgeInfo(conv);
    const unreadPart = unread.descriptionPrefix;
    const stamp = deleted ? conv.deleted_at : conv.updated_at;
    const stampHuman = stamp ? formatConversationUpdatedAtForTooltip(stamp) : "";
    const stampLine =
      stamp && stampHuman
        ? `\n${deleted ? "Deleted" : "Updated"} ${stampHuman} (${stamp})`
        : stamp
          ? `\n${deleted ? "Deleted" : "Updated"} ${stamp}`
          : "";
    this.tooltip = `${label}\n${conv.id}${stampLine}${unread.tooltipSuffix}`;
    this.description = [unreadPart, pinPart, rel].filter(Boolean).join("") || undefined;
    this.contextValue = deleted ? "deletedConversation" : "conversation";
    this.iconPath = new vscode.ThemeIcon(deleted ? "trash" : "comment-discussion");
    if (!deleted) {
      this.command = {
        command: "colcoor.openConversation",
        title: "Open conversation",
        arguments: [conv.id, conv.title],
      };
    }
  }
}

export class ConversationsTreeProvider implements vscode.TreeDataProvider<ConversationsTreeNode> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<
    ConversationsTreeNode | undefined
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(
    private readonly api: ColcoorClient,
    private readonly getHasToken: () => Promise<boolean>,
  ) {}

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: ConversationsTreeNode): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: ConversationsTreeNode): Promise<ConversationsTreeNode[]> {
    const hasToken = await this.getHasToken();
    if (!hasToken) {
      return [];
    }
    try {
      if (element?.kind === "recentlyDeletedSection") {
        const deleted = await listDeletedConversationsCached(this.api);
        const sorted = [...deleted].sort((a, b) => {
          const ta = a.deleted_at ? Date.parse(a.deleted_at) : 0;
          const tb = b.deleted_at ? Date.parse(b.deleted_at) : 0;
          return tb - ta;
        });
        return sorted.map((r) => new ConversationTreeItem(r, { deleted: true }));
      }
      if (element) {
        return [];
      }

      const rows = await listConversationsCached(this.api);
      const sorted = [...rows].sort((a, b) => {
        if (a.pinned !== b.pinned) {
          return a.pinned ? -1 : 1;
        }
        const ta = a.updated_at ? Date.parse(a.updated_at) : 0;
        const tb = b.updated_at ? Date.parse(b.updated_at) : 0;
        return tb - ta;
      });
      const live = sorted.map((r) => new ConversationTreeItem(r));
      const deleted = await listDeletedConversationsCached(this.api);
      if (deleted.length === 0) {
        return live;
      }
      return [...live, new RecentlyDeletedSectionItem()];
    } catch (e) {
      void showColcoorApiFailure(e);
      return [];
    }
  }
}
