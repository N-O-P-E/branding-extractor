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

// Generate a nonce for authenticated DOM event communication
const virNonce = crypto.randomUUID();
// Store in isolated world so content-ui scripts can access it
(window as unknown as { __virNonce: string }).__virNonce = virNonce;

// Detect if the current page is likely a Shopify page
const isLikelyShopifyPage = (): boolean => {
  const { hostname } = window.location;
  if (hostname.endsWith('.myshopify.com') || hostname === 'admin.shopify.com') return true;
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]') {
    // Check for Shopify indicators on local dev
    return !!(
      document.querySelector('meta[name="shopify-checkout-api-token"]') ||
      document.querySelector('script[src*="cdn.shopify.com"]') ||
      document.querySelector('link[href*="cdn.shopify.com"]')
    );
  }
  // Custom domains: check for Shopify indicators in the DOM
  return !!(
    document.querySelector('meta[name="shopify-checkout-api-token"]') ||
    document.querySelector('script[src*="cdn.shopify.com"]') ||
    document.querySelector('link[href*="cdn.shopify.com"]')
  );
};

// Inject main-world scripts for data that's only accessible in the page context
// Using src instead of textContent avoids CSP inline-script violations
const scriptsToInject = ['console-capture.js'];
if (isLikelyShopifyPage()) {
  scriptsToInject.push('shopify-data.js');
}

for (const scriptFile of scriptsToInject) {
  try {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL(scriptFile);
    script.dataset.virNonce = virNonce;
    (document.head || document.documentElement).appendChild(script);
    script.onload = () => script.remove();
  } catch {
    // Injection failed — silently ignore
  }
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
