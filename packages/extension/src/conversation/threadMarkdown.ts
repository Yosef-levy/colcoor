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

marked.use({ gfm: true, breaks: true });

function normalizeMathExpression(expr: string, collapseEscapedBackslashes: boolean): string {
  const trimmed = expr.trim();
  return collapseEscapedBackslashes ? trimmed.replace(/\\\\/g, "\\") : trimmed;
}

function renderMathExpression(
  expr: string,
  displayMode: boolean,
  collapseEscapedBackslashes: boolean,
): string {
  const normalized = normalizeMathExpression(expr, collapseEscapedBackslashes);
  try {
    const mathml = temml.renderToString(normalized, {
      displayMode,
      throwOnError: false,
      annotate: true,
    });
    return `<span class="${displayMode ? "math-block" : "math-inline"}">${mathml}</span>`;
  } catch {
    const safe = sanitizeHtml(normalized, { allowedTags: [], allowedAttributes: {} });
    return displayMode
      ? `<pre class="math-block math-fallback">${safe}</pre>`
      : `<code class="math-inline math-fallback">${safe}</code>`;
  }
}

type MathReplacement = {
  markdown: string;
  mathHtml: string[];
};

function replaceMathDelimiters(input: string): MathReplacement {
  const codeSegments: string[] = [];
  const protectedInput = input.replace(
    /```[\s\S]*?```|~~~[\s\S]*?~~~|(`+)[^\n]*?\1/g,
    (code) => {
      const token = `COLCOORCODEPLACEHOLDER${codeSegments.length}END`;
      codeSegments.push(code);
      return token;
    },
  );
  const mathHtml: string[] = [];
  const mathToken = (
    expr: string,
    displayMode: boolean,
    collapseEscapedBackslashes: boolean,
  ): string => {
    const token = `COLCOORMATHPLACEHOLDER${mathHtml.length}END`;
    mathHtml.push(renderMathExpression(expr, displayMode, collapseEscapedBackslashes));
    return token;
  };

  const withMathTokens = protectedInput
    .replace(/\$\$\s*([\s\S]*?)\s*\$\$/g, (_m, expr: string) =>
      mathToken(expr, true, false),
    )
    .replace(
      /(^|[^\\$])\$([^\n$]*?\S)\$(?!\$)/g,
      (match, prefix: string, expr: string) =>
        /^\s/u.test(expr) ? match : `${prefix}${mathToken(expr, false, false)}`,
    )
    .replace(
      /(\\{1,2})\[\s*([\s\S]*?)\s*\1\]/g,
      (_m, opener: string, expr: string) => mathToken(expr, true, opener.length === 2),
    )
    .replace(
      /(\\{1,2})\(([\s\S]*?)\1\)/g,
      (_m, opener: string, expr: string) => mathToken(expr, false, opener.length === 2),
    );

  const markdown = withMathTokens.replace(
    /COLCOORCODEPLACEHOLDER(\d+)END/g,
    (_match, index: string) => codeSegments[Number(index)] ?? "",
  );
  return { markdown, mathHtml };
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
  const math = replaceMathDelimiters(raw);
  let rendered = marked.parse(math.markdown, { async: false }) as string;
  rendered = rendered.replace(
    /COLCOORMATHPLACEHOLDER(\d+)END/g,
    (_match, index: string) => math.mathHtml[Number(index)] ?? "",
  );
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
