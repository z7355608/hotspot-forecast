/**
 * HTML Sanitization Utility
 *
 * Wraps DOMPurify to provide a consistent, safe way to render
 * user-generated or LLM-generated HTML content.
 */
import DOMPurify from "dompurify";

/**
 * Sanitize an HTML string, removing potentially dangerous elements
 * like <script>, <iframe>, event handlers (onclick, onerror, etc.).
 *
 * Allows safe structural tags (headings, lists, tables, etc.) and
 * Tailwind CSS class attributes.
 */
export function sanitizeHtml(dirty: string): string {
  return DOMPurify.sanitize(dirty, {
    // Allow common structural and formatting tags
    ALLOWED_TAGS: [
      "h1", "h2", "h3", "h4", "h5", "h6",
      "p", "br", "hr",
      "div", "span",
      "strong", "b", "em", "i", "u", "s", "del",
      "code", "pre", "blockquote",
      "ul", "ol", "li",
      "table", "thead", "tbody", "tr", "th", "td",
      "a", "img",
      "sup", "sub", "mark", "small",
    ],
    // Allow class (for Tailwind), href, src, alt, target
    ALLOWED_ATTR: [
      "class", "href", "src", "alt", "title", "target", "rel",
      "colspan", "rowspan", "width", "height",
    ],
    // Force links to open in new tab safely
    ADD_ATTR: ["target"],
    // Remove any URI schemes except http(s) and mailto
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
  });
}
