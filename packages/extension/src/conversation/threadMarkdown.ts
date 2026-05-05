import { marked } from "marked";
import sanitizeHtml from "sanitize-html";
import temml from "temml";

const ALLOWED_MATHML_TAGS = [
  "math",
  "semantics",
  "annotation",
  "annotation-xml",
  "mrow",
  "mi",
  "mn",
  "mo",
  "mtext",
  "mspace",
  "ms",
  "mfrac",
  "msqrt",
  "mroot",
  "msub",
  "msup",
  "msubsup",
  "munder",
  "mover",
  "munderover",
  "mtable",
  "mtr",
  "mtd",
  "mstyle",
  "mpadded",
  "mphantom",
  "menclose",
  "mfenced",
  "mmultiscripts",
  "mprescripts",
  "none",
];

marked.use({ gfm: true, breaks: false });

function normalizeMathExpression(expr: string): string {
  return expr.replace(/\\\\/g, "\\").trim();
}

function renderMathExpression(expr: string, displayMode: boolean): string {
  try {
    const mathml = temml.renderToString(normalizeMathExpression(expr), {
      displayMode,
      throwOnError: false,
      annotate: true,
    });
    return `<span class="${displayMode ? "math-block" : "math-inline"}">${mathml}</span>`;
  } catch {
    const safe = sanitizeHtml(normalizeMathExpression(expr), { allowedTags: [], allowedAttributes: {} });
    return displayMode
      ? `<pre class="math-block math-fallback">${safe}</pre>`
      : `<code class="math-inline math-fallback">${safe}</code>`;
  }
}

function replaceMathDelimiters(input: string): string {
  return input
    .replace(/\\{1,2}\[\s*([\s\S]*?)\s*\\{1,2}\]/g, (_m, expr: string) =>
      renderMathExpression(expr, true),
    )
    .replace(/\\{1,2}\(([\s\S]*?)\\{1,2}\)/g, (_m, expr: string) =>
      renderMathExpression(expr, false),
    );
}

function wrapCodeBlocksWithCopyButton(html: string): string {
  return html.replace(
    /<pre><code([^>]*)>([\s\S]*?)<\/code><\/pre>/g,
    (_m, attrs: string, codeHtml: string) =>
      `<div class="code-block-wrap"><button type="button" class="thread-copy-icon-btn code-copy" aria-label="Copy code block" title="Copy code block">⧉</button><pre><code${attrs}>${codeHtml}</code></pre></div>`,
  );
}

export function markdownToSafeHtml(markdown: string): string {
  const raw = (markdown ?? "").replace(/\r\n/g, "\n");
  const rendered = marked.parse(replaceMathDelimiters(raw), { async: false }) as string;
  const sanitized = sanitizeHtml(rendered, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat([
      "del",
      "img",
      "input",
      "table",
      "thead",
      "tbody",
      "tr",
      "th",
      "td",
      "span",
      ...ALLOWED_MATHML_TAGS,
    ]),
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      a: ["href", "name", "target", "rel", "title"],
      code: ["class"],
      span: ["class", "style"],
      pre: ["class"],
      input: ["type", "checked", "disabled"],
      math: ["display", "xmlns", "class", "style"],
      "annotation-xml": ["encoding"],
      mstyle: ["displaystyle", "scriptlevel"],
      mo: ["stretchy", "form", "fence", "separator", "symmetric", "lspace", "rspace"],
      img: ["src", "alt", "title"],
    },
    allowedSchemes: ["http", "https", "data"],
    transformTags: {
      a: (tagName, attribs) => {
        const href = typeof attribs.href === "string" ? attribs.href : "";
        if (!/^https?:\/\/[^\s]+$/i.test(href)) {
          return { tagName: "span", attribs: {} };
        }
        return {
          tagName,
          attribs: { ...attribs, target: "_blank", rel: "noopener noreferrer" },
        };
      },
    },
    disallowedTagsMode: "discard",
  });
  return wrapCodeBlocksWithCopyButton(sanitized);
}
