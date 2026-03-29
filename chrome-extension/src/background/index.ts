import 'webextension-polyfill';

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);

// Theme icon tint colors
const THEME_ICON_COLORS: Record<string, [number, number, number]> = {
  default: [139, 92, 246], // purple
  'ask-phill': [222, 0, 21], // red
  strix: [255, 219, 50], // yellow
};

const updateIconForTheme = async (themeId: string) => {
  const [r, g, b] = THEME_ICON_COLORS[themeId] ?? THEME_ICON_COLORS.default;
  try {
    const response = await fetch(chrome.runtime.getURL('icon-34.png'));
    const blob = await response.blob();
    const bitmap = await createImageBitmap(blob);
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(bitmap, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] > 0) {
        data[i] = r;
        data[i + 1] = g;
        data[i + 2] = b;
      }
    }
    ctx.putImageData(imageData, 0, 0);
    chrome.action.setIcon({ imageData: ctx.getImageData(0, 0, canvas.width, canvas.height) });
  } catch {
    // Fallback: use default icon
  }
};

// Apply saved theme icon on startup
chrome.storage.local.get('extensionTheme').then(data => {
  const theme = (data.extensionTheme as string) ?? 'default';
  if (theme !== 'default') updateIconForTheme(theme);
});

/** Capture full page via Chrome DevTools Protocol — no scrolling, no stitching. */
const captureFullPageCDP = async (tabId: number): Promise<string> => {
  const target = { tabId };
  await chrome.debugger.attach(target, '1.3');

  try {
    // Get full page dimensions without changing the viewport
    const layoutResult = (await chrome.debugger.sendCommand(target, 'Page.getLayoutMetrics')) as {
      contentSize: { width: number; height: number };
      cssContentSize: { width: number; height: number };
    };

    const { width, height } = layoutResult.cssContentSize ?? layoutResult.contentSize;

    // Capture with a clip region covering the full page — viewport stays unchanged
    const screenshot = (await chrome.debugger.sendCommand(target, 'Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true,
      clip: {
        x: 0,
        y: 0,
        width,
        height: Math.min(height, 16384),
        scale: 1,
      },
    })) as { data: string };

    return `data:image/png;base64,${screenshot.data}`;
  } finally {
    await chrome.debugger.detach(target).catch(() => {});
  }
};

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'CAPTURE_VISIBLE_TAB') {
    chrome.tabs.captureVisibleTab(undefined, { format: 'png' }, dataUrl => {
      sendResponse({ dataUrl });
    });
    return true;
  }

  if (message.type === 'CAPTURE_FULL_PAGE') {
    const { tabId } = message.payload;
    captureFullPageCDP(tabId)
      .then(dataUrl => sendResponse({ dataUrl }))
      .catch(err => sendResponse({ dataUrl: '', error: String(err) }));
    return true;
  }

  if (message.type === 'UPDATE_ICON_THEME') {
    updateIconForTheme(message.payload.theme);
    return;
  }
});
