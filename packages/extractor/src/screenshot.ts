/**
 * Capture a full-page screenshot by scrolling through the page and stitching
 * viewport captures together.
 *
 * Must be called from the content script context. Each viewport capture is
 * requested from the background worker via CAPTURE_VISIBLE_TAB.
 */
const captureFullPage = async (): Promise<string> => {
  const totalHeight = document.documentElement.scrollHeight;
  const viewportHeight = window.innerHeight;
  const viewportWidth = window.innerWidth;
  const dpr = window.devicePixelRatio || 1;
  const originalScroll = window.scrollY;

  const captures: { y: number; dataUrl: string }[] = [];
  let currentY = 0;

  while (currentY < totalHeight) {
    window.scrollTo(0, currentY);
    // Wait for rendering to settle
    await new Promise<void>(resolve => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });

    const dataUrl = await new Promise<string>((resolve, reject) => {
      chrome.runtime.sendMessage({ type: 'CAPTURE_VISIBLE_TAB' }, (response: { dataUrl: string }) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!response?.dataUrl) {
          reject(new Error('Empty capture response'));
          return;
        }
        resolve(response.dataUrl);
      });
    });

    captures.push({ y: currentY, dataUrl });
    currentY += viewportHeight;
  }

  // Restore scroll position
  window.scrollTo(0, originalScroll);

  // If only one capture, return it directly (no stitching needed)
  if (captures.length === 1) {
    return captures[0].dataUrl;
  }

  // Stitch captures into one image using OffscreenCanvas
  const canvasWidth = viewportWidth * dpr;
  const canvasHeight = totalHeight * dpr;
  const canvas = new OffscreenCanvas(canvasWidth, canvasHeight);
  const ctx = canvas.getContext('2d')!;

  for (const capture of captures) {
    const response = await fetch(capture.dataUrl);
    const blob = await response.blob();
    const img = await createImageBitmap(blob);
    const drawY = capture.y * dpr;
    const drawHeight = Math.min(viewportHeight * dpr, canvasHeight - drawY);
    ctx.drawImage(img, 0, 0, img.width, drawHeight, 0, drawY, img.width, drawHeight);
  }

  const resultBlob = await canvas.convertToBlob({ type: 'image/png' });
  return new Promise<string>(resolve => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.readAsDataURL(resultBlob);
  });
};

export { captureFullPage };
