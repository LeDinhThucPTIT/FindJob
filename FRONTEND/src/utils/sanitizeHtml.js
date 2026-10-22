import DOMPurify from "dompurify";

export const sanitizeHtml = (html) => DOMPurify.sanitize(String(html || ""), {
  ALLOWED_TAGS: ["p", "br", "strong", "b", "em", "i", "u", "ul", "ol", "li", "h1", "h2", "h3", "h4", "blockquote", "a", "div", "span", "table", "thead", "tbody", "tr", "th", "td"],
  ALLOWED_ATTR: ["href", "title", "colspan", "rowspan"],
});
