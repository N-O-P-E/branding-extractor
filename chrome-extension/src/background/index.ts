import 'webextension-polyfill';

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);

chrome.runtime.onMessage.addListener((message: { type: string; payload?: unknown }, sender) => {
  // Only accept messages from our own extension
  if (sender.id !== chrome.runtime.id) return false;

  if (message.type === 'UPDATE_ICON_THEME') {
    const themeId = (message.payload as { theme?: string })?.theme ?? 'default';
    updateIconForTheme(themeId);
    return false;
  }

  return false;
});

/** Theme icon colors — maps theme ID to the target tint color [r,g,b] */
const THEME_ICON_COLORS: Record<string, [number, number, number]> = {
  default: [139, 92, 246], // purple #8B5CF6
};

const updateIconForTheme = async (themeId: string) => {
  const targetColor = THEME_ICON_COLORS[themeId] ?? THEME_ICON_COLORS.default;

  try {
    const response = await fetch(chrome.runtime.getURL('icon-34.png'));
    const blob = await response.blob();
    const bitmap = await createImageBitmap(blob);

    const canvas = new OffscreenCanvas(34, 34);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(bitmap, 0, 0, 34, 34);
    const imageData = ctx.getImageData(0, 0, 34, 34);
    const data = imageData.data;

    // Tint: replace non-transparent pixels with the target color, keeping alpha
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] > 0) {
        data[i] = targetColor[0];
        data[i + 1] = targetColor[1];
        data[i + 2] = targetColor[2];
        // Keep original alpha
      }
    }

    ctx.putImageData(imageData, 0, 0);
    await chrome.action.setIcon({ imageData: imageData as unknown as ImageData });
  } catch {
    // Fallback to default icon
    await chrome.action.setIcon({ path: 'icon-34.png' });
  }
};

// Apply saved theme icon on startup
chrome.storage.local.get('extensionTheme', result => {
  const theme = (result.extensionTheme as string) ?? 'default';
  updateIconForTheme(theme);
});
