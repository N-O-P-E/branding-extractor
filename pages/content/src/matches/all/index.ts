import {
  captureFullPage,
  detectComponents,
  extractAnimations,
  extractColors,
  extractSpacing,
  extractTypography,
  OverrideEngine,
  scanStylesheets,
} from '@extension/extractor';
import type { TokenOverride } from '@extension/extractor';
import type {
  CaptureScreenshotResponse,
  ExtensionMessage,
  ExtractStylesResponse,
  GetOverrideStateResponse,
} from '@extension/shared';

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
    sendResponse: (
      response: ExtractStylesResponse | GetOverrideStateResponse | CaptureScreenshotResponse | void,
    ) => void,
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
      return;
    }

    if (message.type === 'APPLY_OVERRIDE') {
      getEngine().applyOverride(message.payload);
      return;
    }

    if (message.type === 'REMOVE_OVERRIDE') {
      getEngine().removeOverride(message.payload.tokenId);
      return;
    }

    if (message.type === 'CLEAR_ALL_OVERRIDES') {
      getEngine().clearAll();
      return;
    }

    if (message.type === 'SET_OVERRIDES_ENABLED') {
      overridesEnabled = message.payload.enabled;
      getEngine().setEnabled(message.payload.enabled);
      return;
    }

    if (message.type === 'GET_OVERRIDE_STATE') {
      sendResponse({
        overrides: engine ? engine.getOverrides() : [],
        enabled: overridesEnabled,
      });
      return;
    }

    if (message.type === 'CAPTURE_SCREENSHOT') {
      const { mode } = message.payload;

      const capture = async () => {
        if (mode === 'before' && engine) {
          // Temporarily disable overrides
          engine.setEnabled(false);
          await new Promise(resolve => requestAnimationFrame(resolve));
          const dataUrl = await captureFullPage();
          engine.setEnabled(overridesEnabled); // restore
          return dataUrl;
        }
        // 'after' or 'current' — capture as-is
        return captureFullPage();
      };

      capture().then(dataUrl => sendResponse({ dataUrl }));
      return true; // only this handler is async
    }
  },
);
