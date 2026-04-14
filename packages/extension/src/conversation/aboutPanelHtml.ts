/**
 * Static help HTML for the About webview ([ui-features.md] §2).
 * Policy links are injected as a pre-vetted fragment from {@link buildLegalPolicySectionHtml}.
 */
export function getAboutPanelHtml(policySectionHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>About Colcoor</title>
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
  <h1>About Colcoor</h1>
  <p>
    Colcoor helps you run <strong>branching conversations</strong> with the Cursor agent while
    <strong>you choose where each reply attaches</strong> on the event tree. Your team can share threads,
    pin important chats, and keep drafts private until you are ready.
  </p>
  <p>What you see here is the conversation structure and saved messages — not a raw agent transcript.</p>
  <ul>
    <li>Use the <strong>tree</strong> to pick the parent node for your next message.</li>
    <li><strong>Resend assistant</strong> asks for a new assistant reply under an existing user message.</li>
    <li>
      Use <strong>CLI setup</strong> and <strong>Agent API key</strong> from the conversation detail bar,
      side chat, or drawers (or the Command Palette) so the local Cursor agent can answer in this workspace.
    </li>
    <li>Adjust <strong>Settings → Colcoor</strong> for the API base URL and agent mode.</li>
  </ul>
  ${policySectionHtml}
  <p class="muted">Docs in the repository describe the domain model, API, and permissions.</p>
</body>
</html>`;
}
