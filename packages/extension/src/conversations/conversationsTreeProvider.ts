import * as vscode from "vscode";
import type { ColcoorApiClient, ConversationSummary } from "../api/client";

export class ConversationTreeItem extends vscode.TreeItem {
  constructor(public readonly conv: ConversationSummary) {
    const label = conv.title?.trim() ? conv.title : "(untitled)";
    super(label, vscode.TreeItemCollapsibleState.None);
    this.id = conv.id;
    this.tooltip = `${label}\n${conv.id}`;
    this.description = conv.pinned ? "pinned" : undefined;
    this.contextValue = "conversation";
    this.iconPath = new vscode.ThemeIcon("comment-discussion");
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
      return rows.map((r) => new ConversationTreeItem(r));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      void vscode.window.showErrorMessage(`Colcoor: ${msg}`);
      return [];
    }
  }
}
