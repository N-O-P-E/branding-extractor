import {
  extractColors,
  extractTypography,
  extractSpacing,
  detectComponents,
  extractAnimations,
  scanStylesheets,
} from '@extension/extractor';
import type { ExtensionMessage, ExtractStylesResponse } from '@extension/shared';

chrome.runtime.onMessage.addListener(
  (message: ExtensionMessage, _sender, sendResponse: (response: ExtractStylesResponse) => void) => {
    if (message.type === 'EXTRACT_STYLES') {
      const scan = scanStylesheets(document);
      const result = {
        colors: extractColors(document.body),
        typography: extractTypography(document.body),
        spacing: extractSpacing(document.body),
        components: detectComponents(document.body),
        animations: extractAnimations(document.body),
        tokens: scan.tokens,
        timestamp: Date.now(),
        url: window.location.href,
      };
      sendResponse({ result });
    }

    return true;
  },
);
