import type { GetHtmlSnippetMessage, HtmlSnippetResponse } from '@extension/shared';

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

// Inject console capture into the page's main world via external script
// Using src instead of textContent avoids CSP inline-script violations
try {
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('console-capture.js');
  (document.head || document.documentElement).appendChild(script);
  script.onload = () => script.remove();
} catch {
  // Injection failed — console errors will just be empty
}

chrome.runtime.onMessage.addListener(
  (message: GetHtmlSnippetMessage, _sender, sendResponse: (response: HtmlSnippetResponse) => void) => {
    if (message.type === 'GET_HTML_SNIPPET') {
      const { x, y } = message.payload;
      const html = getCleanHtml(x, y);
      sendResponse({ html });
    }
  },
);
