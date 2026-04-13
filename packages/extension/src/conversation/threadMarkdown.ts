import { marked, Renderer } from "marked";
import sanitizeHtml from "sanitize-html";

const defaultCodeRenderer = new Renderer();

marked.use({
  gfm: true,
  breaks: true,
  pedantic: false,
  renderer: {
    code(code: string, infostring: string | undefined, escaped: boolean) {
      const inner = defaultCodeRenderer.code(code, infostring, escaped);
      return (
        '<div class="code-block-wrap">' +
        '<button type="button" class="code-copy btn-secondary" aria-label="Copy code">Copy</button>' +
        inner +
        "</div>"
      );
    },
  },
});

const EXTRA_TAGS = [
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "img",
  "pre",
  "code",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
  "hr",
  "del",
  "input",
  "span",
  "button",
];

/**
 * Render markdown (GFM-style) to HTML safe for `innerHTML` in the webview.
 */
export function markdownToSafeHtml(markdown: string): string {
  const raw = marked.parse(markdown ?? "", { async: false }) as string;
  return sanitizeHtml(raw, {
    allowedTags: [...sanitizeHtml.defaults.allowedTags, ...EXTRA_TAGS],
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      a: ["href", "name", "target", "rel"],
      img: ["src", "alt", "title"],
      input: ["type", "disabled", "checked"],
      th: ["align"],
      td: ["align"],
      ul: ["class"],
      ol: ["class"],
      li: ["class"],
      div: ["class"],
      button: ["type", "class", "aria-label"],
    },
    transformTags: {
      a: (tagName, attribs) => ({
        tagName,
        attribs: {
          ...attribs,
          rel: "noopener noreferrer",
          target: "_blank",
        },
      }),
    },
  });
}
