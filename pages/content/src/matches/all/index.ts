import {
  extractColors,
  extractTypography,
  extractSpacing,
  detectComponents,
  extractAnimations,
} from '@extension/extractor';
import type { ExtensionMessage, HtmlSnippetResponse, ExtractStylesResponse } from '@extension/shared';

const minifyHtml = (raw: string): string =>
  raw
    .replace(/\n\s*\n/g, '\n') // collapse blank lines
    .replace(/^\s+/gm, '  ') // normalize indentation to 2 spaces
    .replace(/\s{2,}/g, ' ') // collapse multiple spaces within tags
    .replace(/>\s+</g, '>\n  <') // clean up between tags
    .trim();

const getCleanHtml = (x: number, y: number): string | undefined => {
  const el = document.elementFromPoint(x, y);
  if (!el) return undefined;

  const tag = el.tagName.toLowerCase();
  const classes =
    el.className && typeof el.className === 'string'
      ? `.${el.className.trim().split(/\s+/).slice(0, 5).join('.')}`
      : '';
  const id = el.id ? `#${el.id}` : '';
  const selector = `${tag}${id}${classes}`;

  let html = el.outerHTML;

  // Minify whitespace
  html = minifyHtml(html);

  if (html.length > 1500) {
    const tagMatch = html.match(/^<[^>]+>/);
    if (tagMatch) {
      const openTag = tagMatch[0];
      const innerContent = (el.textContent ?? '').trim().slice(0, 200);
      html = `${openTag}\n  ${innerContent}${innerContent.length >= 200 ? '...' : ''}\n</${tag}>`;
    } else {
      html = html.slice(0, 1500) + '...';
    }
  }

  return `<!-- ${selector} -->\n${html}`;
};

chrome.runtime.onMessage.addListener(
  (
    message: ExtensionMessage,
    _sender,
    sendResponse: (response: HtmlSnippetResponse | ExtractStylesResponse) => void,
  ) => {
    if (message.type === 'GET_HTML_SNIPPET') {
      const { x, y } = message.payload;
      const html = getCleanHtml(x, y);
      sendResponse({ html });
    }

    if (message.type === 'EXTRACT_STYLES') {
      const result = {
        colors: extractColors(document.body),
        typography: extractTypography(document.body),
        spacing: extractSpacing(document.body),
        components: detectComponents(document.body),
        animations: extractAnimations(document.body),
        timestamp: Date.now(),
        url: window.location.href,
      };
      sendResponse({ result });
    }
  },
);
