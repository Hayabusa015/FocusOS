import DOMPurify from 'dompurify';
import { marked } from 'marked';

/**
 * Release notes arrive as HTML (GitHub's rendered release body) or as markdown. Either way they
 * are untrusted text from the network: they are converted, then sanitised down to a short list
 * of plain formatting tags. No links, images, attributes, scripts or styles survive.
 */
const ALLOWED_TAGS = [
  'p',
  'br',
  'ul',
  'ol',
  'li',
  'strong',
  'b',
  'em',
  'i',
  'code',
  'pre',
  'blockquote',
  'h1',
  'h2',
  'h3',
  'h4',
];

export function releaseNotesToSafeHtml(raw: string): string {
  // Markdown conversion first: it leaves HTML (GitHub's rendered notes, or tags mixed into a
  // markdown body) as it is and converts the markdown around it. Sanitising comes last, and is
  // the step that matters: nothing from the network reaches the page without passing it.
  const html = marked.parse(raw, { async: false, gfm: true }) as string;
  return DOMPurify.sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR: [], KEEP_CONTENT: true });
}
