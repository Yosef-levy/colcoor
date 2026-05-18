/** Plain-language empty states and hints (product copy, not technical jargon). */

export type WebviewEmptyStateCopy = {
  title: string;
  body: string;
  actionLabel?: string;
  action?: "addMember" | "openSideChat" | "focusComposer";
};

export const WEBVIEW_EMPTY_COPY = {
  tree: {
    title: "No messages yet",
    body: "Send your first message below. Each reply can become a branch in the tree.",
    actionLabel: "Focus composer",
    action: "focusComposer",
  } satisfies WebviewEmptyStateCopy,
  thread: {
    title: "Select a message",
    body: "Click a message in the tree to read the conversation path here.",
  } satisfies WebviewEmptyStateCopy,
  threadEmptyPath: {
    title: "Nothing on this path",
    body: "Try another branch in the tree, or send a new message to continue.",
    actionLabel: "Focus composer",
    action: "focusComposer",
  } satisfies WebviewEmptyStateCopy,
  sideChat: {
    title: "No side chat yet",
    body: "Use side chat for quick notes with collaborators — separate from the main thread.",
    actionLabel: "Open side chat",
    action: "openSideChat",
  } satisfies WebviewEmptyStateCopy,
  soloCollaborator: {
    title: "Just you so far",
    body: "Invite a collaborator to share this conversation. They need to sign in to Colcoor once before you can add them.",
    actionLabel: "Invite collaborator",
    action: "addMember",
  } satisfies WebviewEmptyStateCopy,
} as const;

export const GETTING_STARTED_LINES = [
  "Create or open a conversation from the sidebar.",
  "Send a message — replies become branches you can switch between.",
  "Invite a collaborator (Conversation → Add member…).",
  "Use side chat for quick notes with your team.",
] as const;

export const TRY_THIS_NEXT_STEPS = [
  { id: "invite" as const, label: "Invite someone" },
  { id: "branch" as const, label: "Create a branch" },
  { id: "sideChat" as const, label: "Side chat hello" },
] as const;
