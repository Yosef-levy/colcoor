import * as vscode from "vscode";
import type { ColcoorApiClient, ConversationSummary } from "../api/client";
import { formatConversationUpdatedAtForTooltip } from "./conversationListUpdatedAt";
import { conversationUnreadBadgeInfo } from "./conversationUnreadBadge";
import { formatRelativeTime } from "../util/formatRelativeTime";
import { showColcoorApiFailure } from "../util/showColcoorApiFailure";

export class ConversationTreeItem extends vscode.TreeItem {
  constructor(public readonly conv: ConversationSummary) {
    const label = conv.title?.trim() ? conv.title : "(untitled)";
    super(label, vscode.TreeItemCollapsibleState.None);
    this.id = conv.id;
    const rel = conv.updated_at ? formatRelativeTime(conv.updated_at) : "";
    const pinPart = conv.pinned ? "Pinned · " : "";
    const unread = conversationUnreadBadgeInfo(conv);
    const unreadPart = unread.descriptionPrefix;
    const updatedHuman = conv.updated_at ? formatConversationUpdatedAtForTooltip(conv.updated_at) : "";
    const updatedLine =
      conv.updated_at && updatedHuman
        ? `\nUpdated ${updatedHuman} (${conv.updated_at})`
        : conv.updated_at
          ? `\nUpdated ${conv.updated_at}`
          : "";
    this.tooltip = `${label}\n${conv.id}${updatedLine}${unread.tooltipSuffix}`;
    this.description = [unreadPart, pinPart, rel].filter(Boolean).join("") || undefined;
    this.contextValue = "conversation";
    this.iconPath = new vscode.ThemeIcon("comment-discussion");
    this.command = {
      command: "colcoor.openConversation",
      title: "Open conversation",
      arguments: [conv.id, conv.title],
    };
  }
}

export class ConversationsTreeProvider implements vscode.TreeDataProvider<ConversationTreeItem> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<ConversationTreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(
    private readonly api: ColcoorApiClient,
    private readonly getHasToken: () => Promise<boolean>,
  ) {}

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: ConversationTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(): Promise<ConversationTreeItem[]> {
    const hasToken = await this.getHasToken();
    if (!hasToken) {
      return [];
    }
    try {
      const rows = await this.api.listConversations();
      const sorted = [...rows].sort((a, b) => {
        if (a.pinned !== b.pinned) {
          return a.pinned ? -1 : 1;
        }
        const ta = a.updated_at ? Date.parse(a.updated_at) : 0;
        const tb = b.updated_at ? Date.parse(b.updated_at) : 0;
        return tb - ta;
      });
      return sorted.map((r) => new ConversationTreeItem(r));
    } catch (e) {
      void showColcoorApiFailure(e);
      return [];
    }
  }
}
