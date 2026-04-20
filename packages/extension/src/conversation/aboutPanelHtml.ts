/**
 * Static help HTML for the Help webview (product summary; [ui-features.md] §2).
 */
export function getAboutPanelHtml(): string {
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
    p { margin: 0.65em 0; }
    ul { margin: 0.5em 0; padding-left: 1.25em; }
    li { margin: 0.35em 0; }
    a { color: var(--vscode-textLink-foreground); }
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
      <strong>Side chat</strong> lives in the same conversation tab: a second channel for short asides with people in
      the thread. Open it with <strong>View → Open side chat</strong>. In the composer, type <strong>@</strong> to mention
      <strong>All</strong> (<strong>@all</strong>) or someone by handle, display name, or the start of their email; sounds and
      badges follow the options below.
    </li>
    <li>
      <strong>Side chat sounds and notifications:</strong> use <strong>Side chat sounds…</strong> in the conversation tab, or run
      <strong>Colcoor: Open side chat sound &amp; notification settings…</strong> from the Command Palette — Settings opens filtered to those Colcoor options.
    </li>
    <li>
      <strong>Invite teammates</strong> who already use Colcoor: open <strong>Conversation → Add member…</strong> (or run
      <strong>Colcoor: Add member…</strong> from the Command Palette). Enter their <strong>user id</strong> (UUID),
      <strong>full email</strong> as stored on their account, or <strong>@handle</strong>. If several accounts share the
      same email, pick the right person from the list (photo, display name, handle, last signed in), then choose
      <strong>Editor</strong> or <strong>Viewer</strong>. Use <strong>Conversation → Members</strong> to see who is in the thread.
    </li>
    <li>
      Optional <strong>message titles</strong> make long threads easier to scan: use
      <strong>Message → Add/edit title…</strong> on a selected user or assistant message. Titles show in the tree and in
      <strong>View → Starred</strong> / <strong>View → Starred &amp; TODO</strong>.
    </li>
    <li>
      <strong>View → Search…</strong> finds matches in conversation messages, <strong>message titles</strong>, notes, and side chat.
      Use the checkboxes at the top of the search panel to narrow the scope.
    </li>
    <li>
      Open <strong>Settings → Extensions → Colcoor</strong> (or the gear on the Colcoor extension card) for the backend URL and how replies are produced.
    </li>
  </ul>
</body>
</html>`;
}
