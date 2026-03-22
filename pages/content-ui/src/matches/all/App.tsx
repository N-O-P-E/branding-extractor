/* eslint-disable jsx-a11y/no-static-element-interactions, jsx-a11y/no-noninteractive-element-interactions */
import { useEffect, useState, useCallback, useRef } from 'react';
import type { Region, ShowScreenshotMessage, ActivateToolMessage, CaptureCompleteMessage } from '@extension/shared';

type OverlayState = 'idle' | 'selecting';

const annotateScreenshot = (screenshotUrl: string, region: Region, imgRect: DOMRect): Promise<string> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scaleX = img.naturalWidth / imgRect.width;
      const scaleY = img.naturalHeight / imgRect.height;

      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Could not get canvas context'));
        return;
      }

      ctx.drawImage(img, 0, 0);

      const rx = region.x * scaleX;
      const ry = region.y * scaleY;
      const rw = region.width * scaleX;
      const rh = region.height * scaleY;

      ctx.strokeStyle = '#8B5CF6';
      ctx.lineWidth = 3 * Math.max(scaleX, scaleY);
      ctx.setLineDash([8 * scaleX, 4 * scaleX]);
      ctx.strokeRect(rx, ry, rw, rh);
      ctx.fillStyle = 'rgba(139, 92, 246, 0.15)';
      ctx.fillRect(rx, ry, rw, rh);

      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => reject(new Error('Failed to load screenshot'));
    img.src = screenshotUrl;
  });

const App = () => {
  const [state, setState] = useState<OverlayState>('idle');
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);
  // activeTool will be used by the pencil tool (Task 9)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [activeTool, setActiveTool] = useState<'select' | 'pencil'>('select');
  const imgRef = useRef<HTMLImageElement>(null);
  const isDragging = useRef(false);
  const justFinishedDrag = useRef(false);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const dragCurrentRef = useRef<{ x: number; y: number } | null>(null);
  const [, forceRender] = useState(0);

  const backdropRef = useRef<HTMLDivElement>(null);

  const dismiss = useCallback(() => {
    setState('idle');
    setScreenshotUrl(null);
    isDragging.current = false;
    dragStartRef.current = null;
    dragCurrentRef.current = null;
  }, []);

  useEffect(() => {
    const listener = (message: ShowScreenshotMessage | ActivateToolMessage) => {
      if (message.type === 'SHOW_SCREENSHOT') {
        setScreenshotUrl(message.payload.screenshotDataUrl);
        setActiveTool(message.payload.tool ?? 'select');
        isDragging.current = false;
        dragStartRef.current = null;
        dragCurrentRef.current = null;
        setState('selecting');
      }
      if (message.type === 'ACTIVATE_TOOL') {
        setActiveTool(message.payload.tool);
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  // Escape to dismiss overlay
  useEffect(() => {
    if (state === 'idle') return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        dismiss();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [state, dismiss]);

  const finishDrag = useCallback(
    async (endX: number, endY: number) => {
      // Flag that a drag just completed so the backdrop click handler won't dismiss
      justFinishedDrag.current = true;
      requestAnimationFrame(() => {
        justFinishedDrag.current = false;
      });

      const start = dragStartRef.current;
      if (!start || !screenshotUrl || !imgRef.current) {
        isDragging.current = false;
        dragStartRef.current = null;
        dragCurrentRef.current = null;
        forceRender(n => n + 1);
        return;
      }

      const x = Math.min(start.x, endX);
      const y = Math.min(start.y, endY);
      const width = Math.abs(endX - start.x);
      const height = Math.abs(endY - start.y);

      isDragging.current = false;
      dragStartRef.current = null;
      dragCurrentRef.current = null;

      if (width < 10 || height < 10) {
        forceRender(n => n + 1);
        return;
      }

      const selectedRegion = { x, y, width, height };

      try {
        const imgRect = imgRef.current.getBoundingClientRect();
        const annotatedDataUrl = await annotateScreenshot(screenshotUrl, selectedRegion, imgRect);

        // Get HTML snippet at center of selection
        const centerX = x + width / 2 + imgRect.left;
        const centerY = y + height / 2 + imgRect.top;
        let snippet: string | undefined;
        try {
          const snippetResponse = await chrome.runtime.sendMessage({
            type: 'GET_HTML_SNIPPET',
            payload: { x: centerX, y: centerY },
          });
          snippet = snippetResponse?.html ?? undefined;
        } catch {
          // Snippet extraction is optional
        }

        const captureMessage: CaptureCompleteMessage = {
          type: 'CAPTURE_COMPLETE',
          payload: {
            screenshotDataUrl: screenshotUrl,
            annotatedScreenshotDataUrl: annotatedDataUrl,
            region: selectedRegion,
            pageUrl: window.location.href,
            viewportWidth: window.innerWidth,
            viewportHeight: window.innerHeight,
            htmlSnippet: snippet,
          },
        };
        chrome.runtime.sendMessage(captureMessage);
        setState('idle');
        setScreenshotUrl(null);
      } catch {
        forceRender(n => n + 1);
      }
    },
    [screenshotUrl],
  );

  // Document-level mousemove/mouseup for reliable drag tracking
  useEffect(() => {
    if (state !== 'selecting') return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current || !imgRef.current) return;
      const rect = imgRef.current.getBoundingClientRect();
      const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
      const y = Math.max(0, Math.min(e.clientY - rect.top, rect.height));
      dragCurrentRef.current = { x, y };
      forceRender(n => n + 1);
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (!isDragging.current || !imgRef.current) return;
      const rect = imgRef.current.getBoundingClientRect();
      const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
      const y = Math.max(0, Math.min(e.clientY - rect.top, rect.height));
      finishDrag(x, y);
    };

    document.addEventListener('mousemove', handleMouseMove, true);
    document.addEventListener('mouseup', handleMouseUp, true);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove, true);
      document.removeEventListener('mouseup', handleMouseUp, true);
    };
  }, [state, finishDrag]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLImageElement>) => {
      if (state !== 'selecting') return;
      e.preventDefault();
      const rect = e.currentTarget.getBoundingClientRect();
      const pos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      isDragging.current = true;
      dragStartRef.current = pos;
      dragCurrentRef.current = pos;
      forceRender(n => n + 1);
    },
    [state],
  );

  const overlayActive = state !== 'idle' && screenshotUrl;

  const dragStart = dragStartRef.current;
  const dragCurrent = dragCurrentRef.current;
  const dragSelection =
    isDragging.current && dragStart && dragCurrent
      ? {
          x: Math.min(dragStart.x, dragCurrent.x),
          y: Math.min(dragStart.y, dragCurrent.y),
          width: Math.abs(dragCurrent.x - dragStart.x),
          height: Math.abs(dragCurrent.y - dragStart.y),
        }
      : null;

  const handleBackdropClick = () => {
    if (state === 'selecting' && !isDragging.current && !justFinishedDrag.current) {
      dismiss();
    }
  };

  return (
    <>
      {overlayActive && (
        <div
          ref={backdropRef}
          tabIndex={-1}
          style={{ ...styles.backdrop, outline: 'none' }}
          onClick={handleBackdropClick}
          onKeyDown={e => {
            if (e.key === 'Escape') {
              dismiss();
            }
            e.stopPropagation();
          }}
          onKeyUp={e => e.stopPropagation()}
          onKeyPress={e => e.stopPropagation()}>
          <button style={styles.closeButton} onClick={dismiss} aria-label="Close overlay">
            &times;
          </button>

          <div style={styles.screenshotContainer} onClick={e => e.stopPropagation()} role="presentation">
            <img
              ref={imgRef}
              src={screenshotUrl}
              alt="Page screenshot"
              style={{
                ...styles.screenshot,
                cursor: 'crosshair',
              }}
              draggable={false}
              onMouseDown={handleMouseDown}
            />

            {dragSelection && dragSelection.width > 0 && dragSelection.height > 0 && (
              <div
                style={{
                  position: 'absolute',
                  left: dragSelection.x,
                  top: dragSelection.y,
                  width: dragSelection.width,
                  height: dragSelection.height,
                  border: '2px dashed #8B5CF6',
                  backgroundColor: 'rgba(139, 92, 246, 0.15)',
                  pointerEvents: 'none',
                }}
              />
            )}
          </div>

          <div style={styles.pillContainer}>
            <button style={styles.pill} onClick={dismiss}>
              Cancel · Esc
            </button>
          </div>

          {!isDragging.current && <div style={styles.hint}>Click and drag to select a region</div>}
        </div>
      )}
    </>
  );
};

const styles: Record<string, React.CSSProperties> = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    zIndex: 999997,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
  },
  closeButton: {
    position: 'absolute',
    top: '16px',
    right: '16px',
    background: 'rgba(15, 23, 42, 0.7)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    color: 'rgba(241, 245, 249, 0.7)',
    border: '1px solid rgba(148, 163, 184, 0.15)',
    borderRadius: '12px',
    width: '40px',
    height: '40px',
    fontSize: '18px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    lineHeight: 1,
    zIndex: 2,
    transition: 'all 0.2s ease-out',
  },
  screenshotContainer: {
    position: 'relative',
    display: 'inline-block',
    maxWidth: '90vw',
    maxHeight: '85vh',
  },
  screenshot: {
    maxWidth: '90vw',
    maxHeight: '85vh',
    objectFit: 'contain',
    borderRadius: '14px',
    boxShadow: '0 24px 48px rgba(0, 0, 0, 0.5)',
    display: 'block',
    userSelect: 'none',
  },
  pillContainer: {
    position: 'absolute',
    bottom: '80px',
    left: 0,
    right: 0,
    display: 'flex',
    justifyContent: 'center',
    zIndex: 2,
    gap: '8px',
  },
  pill: {
    background: 'rgba(15, 23, 42, 0.8)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    color: '#f1f5f9',
    border: '1px solid rgba(148, 163, 184, 0.15)',
    borderRadius: '12px',
    padding: '10px 22px',
    fontSize: '13px',
    fontWeight: 500,
    fontFamily: 'system-ui, -apple-system, sans-serif',
    cursor: 'pointer',
    transition: 'all 0.2s ease-out',
    letterSpacing: '0.01em',
  },
  hint: {
    position: 'absolute',
    top: '24px',
    left: 0,
    right: 0,
    textAlign: 'center',
    color: 'rgba(241, 245, 249, 0.5)',
    fontSize: '13px',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    letterSpacing: '0.02em',
    pointerEvents: 'none',
    zIndex: 2,
  },
};

export default App;
