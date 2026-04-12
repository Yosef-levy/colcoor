import { marked } from "marked";
import sanitizeHtml from "sanitize-html";

marked.use({
  gfm: true,
  breaks: true,
  pedantic: false,
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
