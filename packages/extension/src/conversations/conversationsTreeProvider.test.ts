import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("vscode", () => {
  class TreeItem {
    id?: string;
    description?: string;
    tooltip?: string;
    contextValue?: string;
    iconPath?: unknown;
    command?: unknown;
    constructor(
      public label: string,
      public collapsibleState?: number,
    ) {}
  }
  return {
    TreeItem,
    TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
    ThemeIcon: class ThemeIcon {
      constructor(public id: string) {}
    },
    EventEmitter: class EventEmitter {
      event = () => ({ dispose() {} });
      fire() {}
    },
  };
});

import type { ColcoorClient, ConversationSummary } from "../api/client";
import { invalidateConversationListCache } from "./conversationsListCache";
import {
  ConversationTreeItem,
  ConversationsTreeProvider,
  RecentlyDeletedSectionItem,
} from "./conversationsTreeProvider";

vi.mock("../util/showColcoorApiFailure", () => ({
  showColcoorApiFailure: vi.fn(),
}));

function summary(partial: Partial<ConversationSummary> & { id: string }): ConversationSummary {
  return {
    title: partial.title ?? null,
    pinned: partial.pinned ?? false,
    updated_at: partial.updated_at ?? "2026-01-01T00:00:00Z",
    deleted_at: partial.deleted_at ?? null,
    side_chat_has_unread: false,
    side_chat_unread_count: 0,
    ...partial,
  };
}

function mockApi(opts: {
  live?: ConversationSummary[];
  deleted?: ConversationSummary[];
}): ColcoorClient {
  return {
    listConversations: vi.fn().mockResolvedValue(opts.live ?? []),
    listDeletedConversations: vi.fn().mockResolvedValue(opts.deleted ?? []),
  } as unknown as ColcoorClient;
}

beforeEach(() => {
  invalidateConversationListCache();
});

afterEach(() => {
  invalidateConversationListCache();
});

describe("ConversationsTreeProvider", () => {
  it("returns only live conversations when nothing is deleted", async () => {
    const api = mockApi({
      live: [summary({ id: "live-1", title: "Live", pinned: true })],
    });
    const provider = new ConversationsTreeProvider(api, async () => true);
    const roots = await provider.getChildren();
    expect(roots).toHaveLength(1);
    expect(roots[0]).toBeInstanceOf(ConversationTreeItem);
    expect((roots[0] as ConversationTreeItem).contextValue).toBe("conversation");
  });

  it("appends a Recently Deleted section when deleted conversations exist", async () => {
    const api = mockApi({
      live: [summary({ id: "live-1", title: "Live" })],
      deleted: [
        summary({
          id: "del-1",
          title: "Gone",
          deleted_at: "2026-01-03T00:00:00Z",
        }),
      ],
    });
    const provider = new ConversationsTreeProvider(api, async () => true);
    const roots = await provider.getChildren();
    expect(roots).toHaveLength(2);
    expect(roots[0]).toBeInstanceOf(ConversationTreeItem);
    expect(roots[1]).toBeInstanceOf(RecentlyDeletedSectionItem);

    const deletedChildren = await provider.getChildren(roots[1]);
    expect(deletedChildren).toHaveLength(1);
    const item = deletedChildren[0] as ConversationTreeItem;
    expect(item.contextValue).toBe("deletedConversation");
    expect(item.conv.id).toBe("del-1");
    expect(item.command).toBeUndefined();
  });

  it("returns empty when signed out", async () => {
    const api = mockApi({ live: [summary({ id: "live-1" })] });
    const provider = new ConversationsTreeProvider(api, async () => false);
    expect(await provider.getChildren()).toEqual([]);
  });
});
