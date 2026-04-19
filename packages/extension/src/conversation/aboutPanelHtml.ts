/**
 * Static help HTML for the Help webview (product summary + about; [ui-features.md] §2).
 * Policy links are injected as a pre-vetted fragment from {@link buildLegalPolicySectionHtml}.
 */
export function getAboutPanelHtml(policySectionHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Colcoor — Help</title>
  <style>
    body {
      margin: 0;
      padding: 20px 22px 28px;
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      line-height: 1.55;
      max-width: 44rem;
    }
    h1 { font-size: 1.25em; font-weight: 600; margin: 0 0 12px; }
    h2.muted { font-size: 1em; font-weight: 600; margin: 1.25em 0 0.5em; }
    p { margin: 0.65em 0; }
    ul { margin: 0.5em 0; padding-left: 1.25em; }
    li { margin: 0.35em 0; }
    a { color: var(--vscode-textLink-foreground); }
    .muted { color: var(--vscode-descriptionForeground); font-size: 0.95em; margin-top: 1.25em; }
  </style>
</head>
<body>
  <h1>Colcoor — Help</h1>
  <p>
    Colcoor helps you run <strong>branching conversations</strong> with Cursor while
    <strong>you choose which earlier message each new reply continues from</strong>. Teammates can share the same
    thread, pin what matters, and keep drafts private until you are ready.
  </p>
  <p>
    What you read is the saved thread and layout — not a play-by-play technical log of every behind-the-scenes step
    the assistant took.
  </p>
  <ul>
    <li>Use the <strong>conversation outline</strong> on the left to pick where your next message attaches.</li>
    <li><strong>Resend assistant</strong> asks for another assistant reply under a message you already sent.</li>
    <li>
      <strong>Side chat</strong> is for quick messages next to the main thread; use drawers or starred items to jump
      back to highlights.
    </li>
    <li>
      <strong>Side chat sounds and notifications:</strong> use <strong>Side chat sounds…</strong> in the conversation tab,
      <strong>Colcoor: Open side chat sound &amp; notification settings…</strong> in the Command Palette, or the link in the
      Conversations welcome list — Settings opens filtered to those Colcoor options.
    </li>
    <li>
      <strong>Invite teammates</strong> who already use Colcoor: open <strong>Conversation → Add member…</strong> (or run
      <strong>Colcoor: Add member…</strong> from the Command Palette). Enter their <strong>user id</strong> (UUID),
      <strong>full email</strong> as stored on their account, or <strong>@handle</strong>. If several accounts share the
      same email, pick the right person from the list (photo, display name, handle, last signed in), then choose
      <strong>Editor</strong> or <strong>Viewer</strong>. Use <strong>Conversation → Members</strong> to list who is in the thread.
    </li>
    <li>
      Use the <strong>setup buttons</strong> in the conversation tab or drawers — or the
      <strong>Command Palette</strong> — so Colcoor can run the <strong>assistant in this workspace</strong> on your
      computer when your team has turned that on.
    </li>
    <li>
      Optional <strong>message titles</strong> make long threads easier to scan: use
      <strong>Message → Add/edit title…</strong> on a selected user or assistant message (the same text appears in the
      tree and in the starred list).
    </li>
    <li>
      <strong>View → Search…</strong> (or press <strong>−</strong> when you are not in a text field) finds matches in
      conversation content, <strong>message titles</strong>, notes, and side chat — use the scope checkboxes at the
      top of the drawer to narrow results.
    </li>
    <li>
      Use <strong>Copy ID</strong> in the conversation tab or drawers to copy this conversation’s id (for support or
      your own notes — teammates join via <strong>Add member…</strong>, not by id alone).
    </li>
    <li>Open <strong>Settings → Colcoor</strong> for the server address and how replies are produced.</li>
    <li>
      Optional <strong>Terms</strong>, <strong>Privacy</strong>, and <strong>Refund</strong> links: use the Command Palette
      entry <strong>Colcoor: Open legal policy settings</strong> (or the Conversations welcome list) to jump straight to
      those fields; when set, they also appear in the conversation panel.
    </li>
  </ul>
  ${policySectionHtml}
  <p class="muted">Policy links may appear above when your administrator configures them.</p>
</body>
</html>`;
}
