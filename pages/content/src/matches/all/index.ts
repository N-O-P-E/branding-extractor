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

// Restore live overrides on page load (persisted by the side panel)
chrome.storage.local.get('liveOverrides').then(data => {
  const session = data.liveOverrides as { overrides?: TokenOverride[]; enabled?: boolean } | undefined;
  if (!session || !Array.isArray(session.overrides) || session.overrides.length === 0) return;
  const eng = getEngine();
  for (const override of session.overrides) {
    eng.applyOverride(override);
  }
  overridesEnabled = session.enabled !== false;
  eng.setEnabled(overridesEnabled);
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

    if (message.type === 'GET_PAGE_INFO') {
      sendResponse({
        scrollHeight: document.documentElement.scrollHeight,
        viewportHeight: window.innerHeight,
        viewportWidth: window.innerWidth,
        currentScroll: window.scrollY,
        dpr: window.devicePixelRatio || 1,
      });
      return;
    }

    if (message.type === 'SCROLL_TO') {
      window.scrollTo(0, message.payload.y);
      // Wait two frames for repaint
      requestAnimationFrame(() => requestAnimationFrame(() => sendResponse({ done: true })));
      return true; // async
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
          engine.setEnabled(false);
          await new Promise(resolve => requestAnimationFrame(resolve));
          try {
            const dataUrl = await captureFullPage();
            return dataUrl;
          } finally {
            engine.setEnabled(overridesEnabled);
          }
        }
        return captureFullPage();
      };

      capture()
        .then(dataUrl => sendResponse({ dataUrl }))
        .catch(err => sendResponse({ dataUrl: '', error: String(err) }));
      return true; // only this handler is async
    }
  },
);
