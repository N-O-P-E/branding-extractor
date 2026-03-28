import {
  extractColors,
  extractTypography,
  extractSpacing,
  detectComponents,
  extractAnimations,
  scanStylesheets,
  OverrideEngine,
} from '@extension/extractor';
import type { TokenOverride } from '@extension/extractor';
import type { ExtensionMessage, ExtractStylesResponse, GetOverrideStateResponse } from '@extension/shared';

// Lazy-initialized override engine
let engine: OverrideEngine | null = null;
let overridesEnabled = true;

const getEngine = (): OverrideEngine => {
  if (!engine) {
    engine = new OverrideEngine(document);
  }
  return engine;
};

// Restore active session on page load
chrome.storage.local.get('brandings').then(({ brandings }) => {
  if (!brandings || !Array.isArray(brandings)) return;
  const origin = window.location.origin;
  const session = brandings.find(
    (b: { origin?: string; overrides?: TokenOverride[]; enabled?: boolean }) =>
      b.origin === origin && Array.isArray(b.overrides) && b.overrides.length > 0 && b.enabled,
  );
  if (session) {
    const eng = getEngine();
    for (const override of session.overrides as TokenOverride[]) {
      eng.applyOverride(override);
    }
    overridesEnabled = true;
  }
});

chrome.runtime.onMessage.addListener(
  (
    message: ExtensionMessage,
    _sender,
    sendResponse: (response: ExtractStylesResponse | GetOverrideStateResponse | void) => void,
  ) => {
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

    if (message.type === 'APPLY_OVERRIDE') {
      getEngine().applyOverride(message.payload);
    }

    if (message.type === 'REMOVE_OVERRIDE') {
      getEngine().removeOverride(message.payload.tokenId);
    }

    if (message.type === 'CLEAR_ALL_OVERRIDES') {
      getEngine().clearAll();
    }

    if (message.type === 'SET_OVERRIDES_ENABLED') {
      overridesEnabled = message.payload.enabled;
      getEngine().setEnabled(message.payload.enabled);
    }

    if (message.type === 'GET_OVERRIDE_STATE') {
      sendResponse({
        overrides: engine ? engine.getOverrides() : [],
        enabled: overridesEnabled,
      });
    }

    return true;
  },
);
