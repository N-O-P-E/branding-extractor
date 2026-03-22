/* eslint-disable jsx-a11y/no-static-element-interactions, jsx-a11y/no-noninteractive-element-interactions */
import { useEffect, useState, useCallback, useRef } from 'react';
import type { Region, ShowScreenshotMessage, ActivateToolMessage, CaptureCompleteMessage } from '@extension/shared';

type OverlayState = 'idle' | 'selecting';

interface Stroke {
  points: Array<{ x: number; y: number }>;
  color: string;
  width: number;
}

const STROKE_COLORS = [
  '#8B5CF6', // purple (default)
  '#EF4444', // red
  '#F59E0B', // amber
  '#22C55E', // green
  '#3B82F6', // blue
  '#EC4899', // pink
  '#FFFFFF', // white
  '#000000', // black
];

const STROKE_WIDTHS = [
  { value: 2, label: 'S' },
  { value: 4, label: 'M' },
  { value: 8, label: 'L' },
];

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

const renderPencilStrokes = (
  ctx: CanvasRenderingContext2D,
  strokesToDraw: Stroke[],
  scaleX: number,
  scaleY: number,
) => {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (const stroke of strokesToDraw) {
    if (stroke.points.length < 2) continue;
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.width * Math.max(scaleX, scaleY);
    ctx.beginPath();
    ctx.moveTo(stroke.points[0].x * scaleX, stroke.points[0].y * scaleY);
    for (let i = 1; i < stroke.points.length; i++) {
      ctx.lineTo(stroke.points[i].x * scaleX, stroke.points[i].y * scaleY);
    }
    ctx.stroke();
  }
};

const App = () => {
  const [state, setState] = useState<OverlayState>('idle');
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<'select' | 'pencil'>('select');
  const imgRef = useRef<HTMLImageElement>(null);
  const isDragging = useRef(false);
  const justFinishedDrag = useRef(false);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const dragCurrentRef = useRef<{ x: number; y: number } | null>(null);
  const [, forceRender] = useState(0);

  // Pencil tool state
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [currentStroke, setCurrentStroke] = useState<Stroke | null>(null);
  const pencilCanvasRef = useRef<HTMLCanvasElement>(null);
  const isPencilDrawing = useRef(false);
  const [strokeColor, setStrokeColor] = useState('#8B5CF6');
  const [strokeWidth, setStrokeWidth] = useState(4);

  const backdropRef = useRef<HTMLDivElement>(null);

  const dismiss = useCallback(() => {
    setState('idle');
    setScreenshotUrl(null);
    isDragging.current = false;
    dragStartRef.current = null;
    dragCurrentRef.current = null;
    setStrokes([]);
    setCurrentStroke(null);
    isPencilDrawing.current = false;
  }, []);

  useEffect(() => {
    const listener = (message: ShowScreenshotMessage | ActivateToolMessage) => {
      if (message.type === 'SHOW_SCREENSHOT') {
        setScreenshotUrl(message.payload.screenshotDataUrl);
        setActiveTool(message.payload.tool ?? 'select');
        isDragging.current = false;
        dragStartRef.current = null;
        dragCurrentRef.current = null;
        setStrokes([]);
        setCurrentStroke(null);
        isPencilDrawing.current = false;
        setState('selecting');
      }
      if (message.type === 'ACTIVATE_TOOL') {
        setActiveTool(message.payload.tool);
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  // Render pencil strokes onto the overlay canvas
  const redrawPencilCanvas = useCallback((allStrokes: Stroke[], active: Stroke | null) => {
    const canvas = pencilCanvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Match canvas pixel dimensions to displayed image size
    const rect = img.getBoundingClientRect();
    if (canvas.width !== rect.width || canvas.height !== rect.height) {
      canvas.width = rect.width;
      canvas.height = rect.height;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Scale is 1:1 because we draw in display coordinates
    const combined = active ? [...allStrokes, active] : allStrokes;
    renderPencilStrokes(ctx, combined, 1, 1);
  }, []);

  // Redraw when strokes change (e.g. after undo)
  useEffect(() => {
    if (activeTool === 'pencil' && state === 'selecting') {
      redrawPencilCanvas(strokes, currentStroke);
    }
  }, [strokes, currentStroke, activeTool, state, redrawPencilCanvas]);

  const handlePencilDone = useCallback(() => {
    if (!screenshotUrl || strokes.length === 0) return;

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);

      const displayedImg = imgRef.current;
      if (!displayedImg) return;
      const displayRect = displayedImg.getBoundingClientRect();
      const scaleX = img.naturalWidth / displayRect.width;
      const scaleY = img.naturalHeight / displayRect.height;
      renderPencilStrokes(ctx, strokes, scaleX, scaleY);

      const annotatedDataUrl = canvas.toDataURL('image/png');
      const captureMessage: CaptureCompleteMessage = {
        type: 'CAPTURE_COMPLETE',
        payload: {
          screenshotDataUrl: screenshotUrl,
          annotatedScreenshotDataUrl: annotatedDataUrl,
          pageUrl: window.location.href,
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
        },
      };
      chrome.runtime.sendMessage(captureMessage);
      setState('idle');
      setScreenshotUrl(null);
      setStrokes([]);
      setCurrentStroke(null);
      isPencilDrawing.current = false;
    };
    img.src = screenshotUrl;
  }, [screenshotUrl, strokes]);

  const handlePencilUndo = useCallback(() => {
    setStrokes(prev => prev.slice(0, -1));
  }, []);

  // Keyboard shortcuts (Escape, Cmd+Z for pencil undo, Enter for pencil done)
  useEffect(() => {
    if (state === 'idle') return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        dismiss();
        return;
      }
      if (activeTool === 'pencil') {
        if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
          e.preventDefault();
          handlePencilUndo();
          return;
        }
        if (e.key === 'Enter') {
          e.preventDefault();
          handlePencilDone();
          return;
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [state, activeTool, dismiss, handlePencilUndo, handlePencilDone]);

  // Pencil tool mouse handlers
  useEffect(() => {
    if (state !== 'selecting' || activeTool !== 'pencil') return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!isPencilDrawing.current || !imgRef.current) return;
      const rect = imgRef.current.getBoundingClientRect();
      const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
      const y = Math.max(0, Math.min(e.clientY - rect.top, rect.height));

      setCurrentStroke(prev => {
        if (!prev) return prev;
        const updated = { points: [...prev.points, { x, y }] };
        // Redraw immediately for real-time feedback
        redrawPencilCanvas(strokes, updated);
        return updated;
      });
    };

    const handleMouseUp = () => {
      if (!isPencilDrawing.current) return;
      isPencilDrawing.current = false;

      setCurrentStroke(prev => {
        if (prev && prev.points.length >= 2) {
          setStrokes(s => [...s, prev]);
        }
        return null;
      });
    };

    document.addEventListener('mousemove', handleMouseMove, true);
    document.addEventListener('mouseup', handleMouseUp, true);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove, true);
      document.removeEventListener('mouseup', handleMouseUp, true);
    };
  }, [state, activeTool, strokes, redrawPencilCanvas]);

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

  // Document-level mousemove/mouseup for reliable drag tracking (select tool)
  useEffect(() => {
    if (state !== 'selecting' || activeTool !== 'select') return;

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
  }, [state, activeTool, finishDrag]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLImageElement>) => {
      if (state !== 'selecting') return;
      e.preventDefault();
      const rect = e.currentTarget.getBoundingClientRect();
      const pos = { x: e.clientX - rect.left, y: e.clientY - rect.top };

      if (activeTool === 'pencil') {
        isPencilDrawing.current = true;
        setCurrentStroke({ points: [pos], color: strokeColor, width: strokeWidth });
        return;
      }

      // Select tool
      isDragging.current = true;
      dragStartRef.current = pos;
      dragCurrentRef.current = pos;
      forceRender(n => n + 1);
    },
    [state, activeTool, strokeColor, strokeWidth],
  );

  const overlayActive = state !== 'idle' && screenshotUrl;

  const dragStart = dragStartRef.current;
  const dragCurrent = dragCurrentRef.current;
  const dragSelection =
    activeTool === 'select' && isDragging.current && dragStart && dragCurrent
      ? {
          x: Math.min(dragStart.x, dragCurrent.x),
          y: Math.min(dragStart.y, dragCurrent.y),
          width: Math.abs(dragCurrent.x - dragStart.x),
          height: Math.abs(dragCurrent.y - dragStart.y),
        }
      : null;

  const handleBackdropClick = () => {
    if (state === 'selecting' && !isDragging.current && !justFinishedDrag.current && !isPencilDrawing.current) {
      // For pencil mode, don't dismiss if there are strokes
      if (activeTool === 'pencil' && strokes.length > 0) return;
      dismiss();
    }
  };

  const isPencilMode = activeTool === 'pencil' && state === 'selecting';

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

            {/* Pencil overlay canvas */}
            {isPencilMode && (
              <canvas
                ref={pencilCanvasRef}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  pointerEvents: 'none',
                  borderRadius: '14px',
                }}
              />
            )}

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

          {/* Pencil floating toolbar — Figma-style */}
          {isPencilMode && (
            <div
              style={{
                position: 'fixed',
                bottom: '24px',
                left: '50%',
                transform: 'translateX(-50%)',
                display: 'flex',
                gap: '2px',
                padding: '6px 8px',
                background: '#1e293b',
                border: '1px solid rgba(148,163,184,0.2)',
                borderRadius: '12px',
                boxShadow: '0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(0,0,0,0.1)',
                fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                zIndex: 2147483647,
                alignItems: 'center',
              }}
              onClick={e => e.stopPropagation()}
              onKeyDown={e => e.stopPropagation()}>
              {/* Stroke width presets */}
              <div style={{ display: 'flex', gap: '2px', alignItems: 'center', padding: '0 4px' }}>
                {STROKE_WIDTHS.map(sw => (
                  <button
                    key={sw.value}
                    onClick={() => setStrokeWidth(sw.value)}
                    title={`${sw.label} stroke`}
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: '6px',
                      border: 'none',
                      background: strokeWidth === sw.value ? 'rgba(139,92,246,0.25)' : 'transparent',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'all 0.15s ease-out',
                      padding: 0,
                    }}>
                    <div
                      style={{
                        width: sw.value + 4,
                        height: sw.value + 4,
                        borderRadius: '50%',
                        background: strokeWidth === sw.value ? '#f1f5f9' : 'rgba(148,163,184,0.5)',
                        transition: 'all 0.15s ease-out',
                      }}
                    />
                  </button>
                ))}
              </div>

              {/* Divider */}
              <div style={{ width: 1, height: 20, background: 'rgba(148,163,184,0.2)', margin: '0 4px' }} />

              {/* Color swatches */}
              <div style={{ display: 'flex', gap: '3px', alignItems: 'center', padding: '0 4px' }}>
                {STROKE_COLORS.map(color => (
                  <button
                    key={color}
                    onClick={() => setStrokeColor(color)}
                    title={color}
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: '50%',
                      border:
                        strokeColor === color
                          ? '2px solid #f1f5f9'
                          : color === '#000000'
                            ? '1px solid rgba(148,163,184,0.3)'
                            : '1px solid rgba(0,0,0,0.15)',
                      background: color,
                      cursor: 'pointer',
                      padding: 0,
                      transition: 'all 0.15s ease-out',
                      boxShadow:
                        strokeColor === color
                          ? `0 0 0 2px ${color === '#FFFFFF' || color === '#F59E0B' ? 'rgba(0,0,0,0.3)' : color}40`
                          : 'none',
                      transform: strokeColor === color ? 'scale(1.15)' : 'scale(1)',
                      flexShrink: 0,
                    }}
                  />
                ))}
              </div>

              {/* Divider */}
              <div style={{ width: 1, height: 20, background: 'rgba(148,163,184,0.2)', margin: '0 4px' }} />

              {/* Undo */}
              <button
                onClick={handlePencilUndo}
                disabled={strokes.length === 0}
                title="Undo (⌘Z)"
                style={{
                  background: 'transparent',
                  color: strokes.length === 0 ? 'rgba(148,163,184,0.25)' : 'rgba(203,213,225,0.9)',
                  border: 'none',
                  borderRadius: '6px',
                  width: 28,
                  height: 28,
                  fontSize: '15px',
                  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                  cursor: strokes.length === 0 ? 'default' : 'pointer',
                  transition: 'all 0.15s ease-out',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 0,
                }}>
                ↩
              </button>

              {/* Divider */}
              <div style={{ width: 1, height: 20, background: 'rgba(148,163,184,0.2)', margin: '0 2px' }} />

              {/* Done */}
              <button
                onClick={handlePencilDone}
                disabled={strokes.length === 0}
                style={{
                  background:
                    strokes.length === 0 ? 'rgba(124,58,237,0.2)' : 'linear-gradient(135deg, #7c3aed, #9333ea)',
                  color: strokes.length === 0 ? 'rgba(255,255,255,0.3)' : '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '5px 14px',
                  fontSize: '12px',
                  fontWeight: 600,
                  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                  cursor: strokes.length === 0 ? 'default' : 'pointer',
                  transition: 'all 0.15s ease-out',
                  whiteSpace: 'nowrap',
                  letterSpacing: '0.02em',
                }}>
                Done
              </button>
            </div>
          )}

          {/* Cancel pill - shown for select tool or pencil with no strokes */}
          {(!isPencilMode || strokes.length === 0) && (
            <div style={styles.pillContainer}>
              <button style={styles.pill} onClick={dismiss}>
                Cancel · Esc
              </button>
            </div>
          )}

          {!isDragging.current && !isPencilMode && <div style={styles.hint}>Click and drag to select a region</div>}
          {isPencilMode && strokes.length === 0 && !isPencilDrawing.current && (
            <div style={styles.hint}>Draw on the screenshot to annotate</div>
          )}
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
