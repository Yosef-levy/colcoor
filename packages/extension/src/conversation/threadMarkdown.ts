function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeMathExpression(expr: string): string {
  // Many model outputs escape LaTeX with doubled backslashes (e.g. "\\theta").
  return expr.replace(/\\\\/g, "\\").trim();
}

function isSafeHttpUrl(url: string): boolean {
  return /^https?:\/\/[^\s]+$/i.test(url);
}

function applyInlineMarkdown(escaped: string): string {
  const inlineCodeTokens: string[] = [];
  let text = escaped.replace(/`([^`]+)`/g, (_m, code: string) => {
    const token = `@@INLINE_CODE_${inlineCodeTokens.length}@@`;
    inlineCodeTokens.push(`<code>${code}</code>`);
    return token;
  });

  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (m, label: string, url: string) => {
    if (!isSafeHttpUrl(url)) {
      return m;
    }
    return `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`;
  });
  text = text.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  text = text.replace(/\*([^*]+)\*/g, "<em>$1</em>");

  for (let i = 0; i < inlineCodeTokens.length; i += 1) {
    text = text.replaceAll(`@@INLINE_CODE_${i}@@`, inlineCodeTokens[i]);
  }
  return text;
}

/**
 * Render markdown (GFM-style) to HTML safe for `innerHTML` in the webview.
 */
export function markdownToSafeHtml(markdown: string): string {
  const raw = (markdown ?? "").replace(/\r\n/g, "\n");
  const codeBlocks: string[] = [];
  const withoutCode = raw.replace(/```([^\n`]*)\n([\s\S]*?)```/g, (_m, lang: string, code: string) => {
    const token = `@@CODE_BLOCK_${codeBlocks.length}@@`;
    const language = lang.trim();
    const languageClass = language ? ` language-${escapeHtml(language)}` : "";
    codeBlocks.push(`<pre><code class="${languageClass.trim()}">${escapeHtml(code)}</code></pre>`);
    return token;
  });
  const blockMathTokens: string[] = [];
  const inlineMathTokens: string[] = [];
  const withoutBlockMath = withoutCode.replace(/\\{1,2}\[\s*([\s\S]*?)\s*\\{1,2}\]/g, (_m, expr: string) => {
    const token = `@@MATH_BLOCK_${blockMathTokens.length}@@`;
    const escapedExpr = escapeHtml(normalizeMathExpression(expr)).replaceAll("\n", "<br>");
    blockMathTokens.push(`<div class="math-block"><code>${escapedExpr}</code></div>`);
    return token;
  });
  const withoutMath = withoutBlockMath.replace(/\\{1,2}\(([^)]*?)\\{1,2}\)/g, (_m, expr: string) => {
    const token = `@@MATH_INLINE_${inlineMathTokens.length}@@`;
    inlineMathTokens.push(
      `<span class="math-inline"><code>${escapeHtml(normalizeMathExpression(expr))}</code></span>`,
    );
    return token;
  });

  const escaped = escapeHtml(withoutMath);
  const lines = escaped.split("\n");
  const out: string[] = [];
  const paragraph: string[] = [];
  let listItems: string[] = [];

  const flushParagraph = (): void => {
    if (paragraph.length === 0) {
      return;
    }
    out.push(`<p>${paragraph.join("<br>")}</p>`);
    paragraph.length = 0;
  };
  const flushList = (): void => {
    if (listItems.length === 0) {
      return;
    }
    out.push(`<ul>${listItems.join("")}</ul>`);
    listItems = [];
  };

  for (const lineRaw of lines) {
    const line = lineRaw.trimEnd();
    const codeTokenMatch = line.match(/^@@CODE_BLOCK_(\d+)@@$/);
    if (codeTokenMatch) {
      flushParagraph();
      flushList();
      out.push(line);
      continue;
    }
    const blockMathMatch = line.match(/^@@MATH_BLOCK_(\d+)@@$/);
    if (blockMathMatch) {
      flushParagraph();
      flushList();
      out.push(line);
      continue;
    }
    if (line.trim().length === 0) {
      flushParagraph();
      flushList();
      continue;
    }
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      flushParagraph();
      flushList();
      const level = headingMatch[1].length;
      out.push(`<h${level}>${applyInlineMarkdown(headingMatch[2])}</h${level}>`);
      continue;
    }
    const listMatch = line.match(/^\s*[-*]\s+(.+)$/);
    if (listMatch) {
      flushParagraph();
      listItems.push(`<li>${applyInlineMarkdown(listMatch[1])}</li>`);
      continue;
    }
    paragraph.push(applyInlineMarkdown(line));
  }
  flushParagraph();
  flushList();

  let html = out.join("\n");
  for (let i = 0; i < codeBlocks.length; i += 1) {
    html = html.replaceAll(`@@CODE_BLOCK_${i}@@`, codeBlocks[i]);
  }
  for (let i = 0; i < blockMathTokens.length; i += 1) {
    html = html.replaceAll(`@@MATH_BLOCK_${i}@@`, blockMathTokens[i]);
  }
  for (let i = 0; i < inlineMathTokens.length; i += 1) {
    html = html.replaceAll(`@@MATH_INLINE_${i}@@`, inlineMathTokens[i]);
  }
  return html;
}
