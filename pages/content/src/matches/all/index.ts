import type { GetHtmlSnippetMessage, HtmlSnippetResponse } from '@extension/shared';

const getCleanHtml = (x: number, y: number): string | undefined => {
  const el = document.elementFromPoint(x, y);
  if (!el) return undefined;

  let html = el.outerHTML;
  if (html.length > 2000) {
    const tagMatch = html.match(/^<[^>]+>/);
    if (tagMatch) {
      const openTag = tagMatch[0];
      const innerContent = el.textContent?.slice(0, 200) ?? '';
      html = `${openTag}\n  ${innerContent}...\n</${el.tagName.toLowerCase()}>`;
    } else {
      html = html.slice(0, 2000) + '...';
    }
  }
  return html;
};

chrome.runtime.onMessage.addListener(
  (message: GetHtmlSnippetMessage, _sender, sendResponse: (response: HtmlSnippetResponse) => void) => {
    if (message.type === 'GET_HTML_SNIPPET') {
      const { x, y } = message.payload;
      const html = getCleanHtml(x, y);
      sendResponse({ html });
    }
  },
);
