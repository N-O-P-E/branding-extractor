/* eslint-disable jsx-a11y/no-static-element-interactions, jsx-a11y/no-noninteractive-element-interactions */
import { useEffect, useState, useCallback, useRef } from 'react';
import type { Region, ShowScreenshotMessage, ActivateToolMessage, CaptureCompleteMessage } from '@extension/shared';

type OverlayState = 'idle' | 'selecting';

interface Stroke {
  points: Array<{ x: number; y: number }>;
  color: string;
  width: number;
}

interface Comment {
  x: number;
  y: number;
  text: string;
  color: string;
}

type CanvasSubTool = 'draw' | 'text';

const isLightColor = (color: string) => color === '#FFFFFF' || color === '#F59E0B';

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

const renderComments = (ctx: CanvasRenderingContext2D, commentsToDraw: Comment[], scaleX: number, scaleY: number) => {
  const scale = Math.max(scaleX, scaleY);
  const fontSize = 14 * scale;
  const lineHeight = fontSize * 1.3;
  ctx.font = `500 ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  ctx.textBaseline = 'top';

  for (const comment of commentsToDraw) {
    if (!comment.text) continue;
    const textColor = isLightColor(comment.color) ? '#000000' : '#FFFFFF';
    const padding = 8 * scale;
    const borderRadius = 6 * scale;
    const lines = comment.text.split('\n');
    const maxLineWidth = Math.max(...lines.map(l => ctx.measureText(l).width));
    const boxW = maxLineWidth + padding * 2;
    const boxH = lines.length * lineHeight + padding * 2;
    const cx = comment.x * scaleX;
    const cy = comment.y * scaleY;

    ctx.beginPath();
    ctx.roundRect(cx, cy, boxW, boxH, borderRadius);
    ctx.fillStyle = comment.color;
    ctx.fill();

    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 1 * scale;
    ctx.setLineDash([]);
    ctx.stroke();

    ctx.fillStyle = textColor;
    lines.forEach((line, i) => {
      ctx.fillText(line, cx + padding, cy + padding + i * lineHeight);
    });
  }
};

const App = () => {
  const [state, setState] = useState<OverlayState>('idle');
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<'select' | 'pencil' | 'inspect'>('select');
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
  const [canvasSubTool, setCanvasSubTool] = useState<CanvasSubTool>('draw');
  const [comments, setComments] = useState<Comment[]>([]);
  const [editingComment, setEditingComment] = useState<{ x: number; y: number } | null>(null);
  const commentInputRef = useRef<HTMLTextAreaElement>(null);
  const [draggingCommentIndex, setDraggingCommentIndex] = useState<number | null>(null);
  const dragCommentOffset = useRef<{ dx: number; dy: number }>({ dx: 0, dy: 0 });

  // Accumulated annotations from select/inspect tools
  const [selections, setSelections] = useState<Region[]>([]);
  const [htmlSnippets, setHtmlSnippets] = useState<string[]>([]);

  // Inspect tool state
  const [inspectActive, setInspectActive] = useState(false);
  const [inspectHighlight, setInspectHighlight] = useState<DOMRect | null>(null);
  const [inspectElInfo, setInspectElInfo] = useState('');
  const inspectHoveredEl = useRef<Element | null>(null);

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
    setComments([]);
    setEditingComment(null);
    setCanvasSubTool('draw');
    setDraggingCommentIndex(null);
    setInspectActive(false);
    setInspectHighlight(null);
    inspectHoveredEl.current = null;
    setSelections([]);
    setHtmlSnippets([]);
    actionHistory.current = [];
  }, []);

  useEffect(() => {
    const listener = (message: ShowScreenshotMessage | ActivateToolMessage) => {
      if (message.type === 'SHOW_SCREENSHOT') {
        const tool = message.payload.tool ?? 'select';
        setActiveTool(tool);

        if (tool === 'inspect') {
          // Inspect mode: no screenshot overlay, work on live page
          setInspectActive(true);
          setInspectHighlight(null);
          inspectHoveredEl.current = null;
          setScreenshotUrl(message.payload.screenshotDataUrl);
          return;
        }

        setScreenshotUrl(message.payload.screenshotDataUrl);
        setInspectActive(false);
        isDragging.current = false;
        dragStartRef.current = null;
        dragCurrentRef.current = null;
        setStrokes([]);
        setCurrentStroke(null);
        isPencilDrawing.current = false;
        setComments([]);
        setEditingComment(null);
        setCanvasSubTool('draw');
        setSelections([]);
        setHtmlSnippets([]);
        actionHistory.current = [];
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

    // Retina-aware: set canvas backing pixels to devicePixelRatio
    const dpr = window.devicePixelRatio || 1;
    const rect = img.getBoundingClientRect();
    const targetW = Math.round(rect.width * dpr);
    const targetH = Math.round(rect.height * dpr);
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Scale strokes by dpr so they map from CSS coords to backing pixels
    const combined = active ? [...allStrokes, active] : allStrokes;
    renderPencilStrokes(ctx, combined, dpr, dpr);
  }, []);

  // Redraw when strokes change (e.g. after undo)
  useEffect(() => {
    if (activeTool === 'pencil' && state === 'selecting') {
      redrawPencilCanvas(strokes, currentStroke);
    }
  }, [strokes, currentStroke, activeTool, state, redrawPencilCanvas]);

  const hasAnyContent = strokes.length > 0 || comments.length > 0 || selections.length > 0;

  const handleDone = useCallback(() => {
    if (!screenshotUrl || !hasAnyContent) return;

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);

      const displayedImg = imgRef.current;
      const displayRect = displayedImg?.getBoundingClientRect();
      const scaleX = displayRect ? img.naturalWidth / displayRect.width : window.devicePixelRatio;
      const scaleY = displayRect ? img.naturalHeight / displayRect.height : window.devicePixelRatio;

      // Draw selection rectangles (stored as fractions 0-1, scale to full image)
      for (const region of selections) {
        const rx = region.x * img.naturalWidth;
        const ry = region.y * img.naturalHeight;
        const rw = region.width * img.naturalWidth;
        const rh = region.height * img.naturalHeight;
        ctx.strokeStyle = '#8B5CF6';
        ctx.lineWidth = 3 * Math.max(scaleX, scaleY);
        ctx.setLineDash([8 * scaleX, 4 * scaleX]);
        ctx.strokeRect(rx, ry, rw, rh);
        ctx.fillStyle = 'rgba(139, 92, 246, 0.15)';
        ctx.fillRect(rx, ry, rw, rh);
      }
      ctx.setLineDash([]);

      // Draw strokes and comments
      renderPencilStrokes(ctx, strokes, scaleX, scaleY);
      renderComments(ctx, comments, scaleX, scaleY);

      const annotatedDataUrl = canvas.toDataURL('image/png');
      const captureMessage: CaptureCompleteMessage = {
        type: 'CAPTURE_COMPLETE',
        payload: {
          screenshotDataUrl: screenshotUrl,
          annotatedScreenshotDataUrl: annotatedDataUrl,
          region: selections[0]
            ? {
                x: selections[0].x * window.innerWidth,
                y: selections[0].y * window.innerHeight,
                width: selections[0].width * window.innerWidth,
                height: selections[0].height * window.innerHeight,
              }
            : undefined,
          pageUrl: window.location.href,
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
          htmlSnippet: htmlSnippets.length > 0 ? htmlSnippets.join('\n\n---\n\n') : undefined,
        },
      };
      chrome.runtime.sendMessage(captureMessage);
      dismiss();
    };
    img.src = screenshotUrl;
  }, [screenshotUrl, hasAnyContent, strokes, comments, selections, htmlSnippets, dismiss]);

  // Track action order for undo: 'stroke' or 'comment'
  const actionHistory = useRef<Array<'stroke' | 'comment' | 'selection'>>([]);

  const handleCanvasUndo = useCallback(() => {
    const lastAction = actionHistory.current.pop();
    if (lastAction === 'comment') {
      setComments(prev => prev.slice(0, -1));
    } else if (lastAction === 'stroke') {
      setStrokes(prev => prev.slice(0, -1));
    } else if (lastAction === 'selection') {
      setSelections(prev => prev.slice(0, -1));
      setHtmlSnippets(prev => prev.slice(0, -1));
    }
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
          handleCanvasUndo();
          return;
        }
        if (e.key === 'Enter' && !editingComment) {
          e.preventDefault();
          handleDone();
          return;
        }
        // D for draw, T for text (only when not editing a comment)
        if (!editingComment) {
          if (e.key === 'd' || e.key === 'D') {
            e.preventDefault();
            setCanvasSubTool('draw');
            setEditingComment(null);
            return;
          }
          if (e.key === 't' || e.key === 'T') {
            e.preventDefault();
            setCanvasSubTool('text');
            return;
          }
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [state, activeTool, dismiss, handleCanvasUndo, handleDone, editingComment]);

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
        const updated = { ...prev, points: [...prev.points, { x, y }] };
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
          actionHistory.current.push('stroke');
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

      // Store as fraction of image display size for consistent rendering
      const imgRect = imgRef.current.getBoundingClientRect();
      setSelections(prev => [
        ...prev,
        {
          x: selectedRegion.x / imgRect.width,
          y: selectedRegion.y / imgRect.height,
          width: selectedRegion.width / imgRect.width,
          height: selectedRegion.height / imgRect.height,
        },
      ]);
      actionHistory.current.push('selection');

      // Try to get HTML snippet at center of selection
      try {
        const imgRect = imgRef.current.getBoundingClientRect();
        const centerX = x + width / 2 + imgRect.left;
        const centerY = y + height / 2 + imgRect.top;
        const snippetResponse = await chrome.runtime.sendMessage({
          type: 'GET_HTML_SNIPPET',
          payload: { x: centerX, y: centerY },
        });
        if (snippetResponse?.html) {
          setHtmlSnippets(prev => [...prev, snippetResponse.html]);
        }
      } catch {
        // Snippet extraction is optional
      }

      // Switch to canvas mode so user can add more annotations
      setActiveTool('pencil');
      forceRender(n => n + 1);
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

  // Comment dragging
  useEffect(() => {
    if (draggingCommentIndex === null) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!imgRef.current) return;
      const rect = imgRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left - dragCommentOffset.current.dx;
      const y = e.clientY - rect.top - dragCommentOffset.current.dy;
      setComments(prev => prev.map((c, i) => (i === draggingCommentIndex ? { ...c, x, y } : c)));
    };

    const handleMouseUp = () => {
      setDraggingCommentIndex(null);
    };

    document.addEventListener('mousemove', handleMouseMove, true);
    document.addEventListener('mouseup', handleMouseUp, true);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove, true);
      document.removeEventListener('mouseup', handleMouseUp, true);
    };
  }, [draggingCommentIndex]);

  // Inspect tool: highlight elements on hover, capture on click
  useEffect(() => {
    if (!inspectActive) return;

    const handleMouseMove = (e: MouseEvent) => {
      // Get element under cursor (skip our own overlay elements)
      const el = document.elementFromPoint(e.clientX, e.clientY);
      if (!el || el.closest('[data-coworker-inspect]')) {
        setInspectHighlight(null);
        setInspectElInfo('');
        inspectHoveredEl.current = null;
        return;
      }
      inspectHoveredEl.current = el;
      const rect = el.getBoundingClientRect();
      setInspectHighlight(rect);

      // Build element info string: tag.class1.class2 · WxH
      const tag = el.tagName.toLowerCase();
      const classes = [...el.classList]
        .slice(0, 3)
        .map(c => `.${c.length > 20 ? c.slice(0, 20) + '…' : c}`)
        .join('');
      const id = el.id ? `#${el.id.length > 20 ? el.id.slice(0, 20) + '…' : el.id}` : '';
      const size = `${Math.round(rect.width)}×${Math.round(rect.height)}`;
      setInspectElInfo(`${tag}${id}${classes} · ${size}`);
    };

    const handleClick = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const el = inspectHoveredEl.current;
      if (!el || !screenshotUrl) return;

      const rect = el.getBoundingClientRect();
      const region = {
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height,
      };

      // Get HTML snippet
      let html = el.outerHTML;
      if (html.length > 2000) {
        const tagMatch = html.match(/^<[^>]+>/);
        if (tagMatch) {
          html = `${tagMatch[0]}\n  ${el.textContent?.slice(0, 200) ?? ''}...\n</${el.tagName.toLowerCase()}>`;
        } else {
          html = html.slice(0, 2000) + '...';
        }
      }
      // Store the selection as viewport-fraction coords (0-1 range)
      // so they can be scaled to any display size of the screenshot
      setSelections(prev => [
        ...prev,
        {
          x: region.x / window.innerWidth,
          y: region.y / window.innerHeight,
          width: region.width / window.innerWidth,
          height: region.height / window.innerHeight,
        },
      ]);
      setHtmlSnippets(prev => [...prev, html]);
      actionHistory.current.push('selection');

      // Exit inspect mode, enter canvas overlay so user can add more
      setInspectActive(false);
      setInspectHighlight(null);
      inspectHoveredEl.current = null;
      setActiveTool('pencil');
      setState('selecting');
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setInspectActive(false);
        setInspectHighlight(null);
        inspectHoveredEl.current = null;
      }
    };

    // Use capture phase to intercept before page handlers
    document.addEventListener('mousemove', handleMouseMove, true);
    document.addEventListener('click', handleClick, true);
    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove, true);
      document.removeEventListener('click', handleClick, true);
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [inspectActive, screenshotUrl]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLImageElement>) => {
      if (state !== 'selecting') return;
      e.preventDefault();
      const rect = e.currentTarget.getBoundingClientRect();
      const pos = { x: e.clientX - rect.left, y: e.clientY - rect.top };

      if (activeTool === 'pencil') {
        if (canvasSubTool === 'text') {
          // Place a text comment at click position
          setEditingComment(pos);
          setTimeout(() => commentInputRef.current?.focus(), 0);
          return;
        }
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
    [state, activeTool, strokeColor, strokeWidth, canvasSubTool],
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
    // Close any editing comment first
    if (editingComment) {
      setEditingComment(null);
      return;
    }
    if (state === 'selecting' && !isDragging.current && !justFinishedDrag.current && !isPencilDrawing.current) {
      // For canvas mode, don't dismiss if there are strokes or comments
      if (activeTool === 'pencil' && (strokes.length > 0 || comments.length > 0)) return;
      dismiss();
    }
  };

  const hasCanvasContent = strokes.length > 0 || comments.length > 0 || selections.length > 0;

  const isPencilMode = activeTool === 'pencil' && state === 'selecting';

  return (
    <>
      {/* Inspect mode: inject cursor style on the page */}
      {inspectActive && <style>{`* { cursor: crosshair !important; }`}</style>}

      {/* Inspect mode highlight overlay */}
      {inspectActive && inspectHighlight && (
        <div
          data-coworker-inspect
          style={{
            position: 'fixed',
            left: inspectHighlight.left - 2,
            top: inspectHighlight.top - 2,
            width: inspectHighlight.width + 4,
            height: inspectHighlight.height + 4,
            border: '2px solid #8B5CF6',
            borderRadius: 4,
            background: 'rgba(139, 92, 246, 0.08)',
            pointerEvents: 'none',
            zIndex: 2147483646,
            transition: 'all 0.1s ease-out',
          }}
        />
      )}
      {inspectActive && (
        <div
          data-coworker-inspect
          style={{
            position: 'fixed',
            top: 24,
            left: '50%',
            transform: 'translateX(-50%)',
            background: '#1e293b',
            border: '1px solid rgba(148,163,184,0.2)',
            borderRadius: 12,
            padding: '8px 16px',
            fontSize: 13,
            fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
            color: 'rgba(241,245,249,0.6)',
            zIndex: 2147483647,
            pointerEvents: 'none',
            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
            whiteSpace: 'nowrap',
          }}>
          {inspectElInfo ? (
            <>
              <span style={{ color: '#c4b5fd', fontFamily: 'monospace, monospace', fontSize: 12 }}>
                {inspectElInfo}
              </span>
              <span style={{ opacity: 0.4, margin: '0 6px' }}>·</span>
              <span style={{ opacity: 0.5 }}>Click to select · Esc to cancel</span>
            </>
          ) : (
            <>
              Click an element to report · <span style={{ opacity: 0.5 }}>Esc to cancel</span>
            </>
          )}
        </div>
      )}

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
                cursor: isPencilMode && canvasSubTool === 'text' ? (editingComment ? 'grab' : 'text') : 'crosshair',
              }}
              draggable={false}
              onMouseDown={handleMouseDown}
              onLoad={() => forceRender(n => n + 1)}
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

            {/* Stored selection rectangles (stored as fractions, scale to image display) */}
            {selections.map((sel, i) => {
              const imgEl = imgRef.current;
              const iw = imgEl?.clientWidth ?? 1;
              const ih = imgEl?.clientHeight ?? 1;
              return (
                <div
                  key={`sel-${i}`}
                  style={{
                    position: 'absolute',
                    left: sel.x * iw,
                    top: sel.y * ih,
                    width: sel.width * iw,
                    height: sel.height * ih,
                    border: '2px dashed #8B5CF6',
                    backgroundColor: 'rgba(139, 92, 246, 0.15)',
                    pointerEvents: 'none',
                  }}
                />
              );
            })}

            {/* Active drag selection */}
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

            {/* Placed comment bubbles */}
            {isPencilMode &&
              comments.map((comment, i) => (
                <div
                  key={i}
                  onMouseDown={e => {
                    e.stopPropagation();
                    e.preventDefault();
                    dragCommentOffset.current = {
                      dx: e.clientX - (imgRef.current?.getBoundingClientRect().left ?? 0) - comment.x,
                      dy: e.clientY - (imgRef.current?.getBoundingClientRect().top ?? 0) - comment.y,
                    };
                    setDraggingCommentIndex(i);
                  }}
                  style={{
                    position: 'absolute',
                    left: comment.x,
                    top: comment.y,
                    background: comment.color,
                    color: isLightColor(comment.color) ? '#000' : '#fff',
                    padding: '6px 10px',
                    borderRadius: 6,
                    fontSize: 13,
                    fontWeight: 500,
                    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                    border: '1px solid rgba(255,255,255,0.3)',
                    whiteSpace: 'pre-wrap',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                    lineHeight: 1.3,
                    boxSizing: 'border-box',
                    maxWidth: 300,
                    cursor: draggingCommentIndex === i ? 'grabbing' : 'grab',
                    userSelect: 'none',
                    zIndex: draggingCommentIndex === i ? 5 : 1,
                  }}>
                  {comment.text}
                </div>
              ))}

            {/* Editing comment input */}
            {isPencilMode && editingComment && (
              <div
                style={{
                  position: 'absolute',
                  left: editingComment.x,
                  top: editingComment.y,
                  zIndex: 10,
                }}
                onClick={e => e.stopPropagation()}
                onKeyDown={e => e.stopPropagation()}
                onMouseDown={e => e.stopPropagation()}>
                <style>{`
                  .coworker-comment-input::placeholder {
                    color: ${isLightColor(strokeColor) ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.5)'};
                  }
                `}</style>
                <textarea
                  ref={commentInputRef}
                  className="coworker-comment-input"
                  placeholder="Comment…"
                  rows={1}
                  style={{
                    background: strokeColor,
                    color: isLightColor(strokeColor) ? '#000' : '#fff',
                    padding: '6px 10px',
                    borderRadius: 6,
                    fontSize: 13,
                    fontWeight: 500,
                    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                    border: '1px solid rgba(255,255,255,0.3)',
                    outline: 'none',
                    minWidth: 80,
                    width: 'auto',
                    maxWidth: 300,
                    boxShadow: '0 2px 12px rgba(0,0,0,0.3)',
                    resize: 'none',
                    overflow: 'hidden',
                    lineHeight: '1.3',
                    display: 'block',
                    boxSizing: 'border-box',
                    // Placeholder color via CSS class won't work in shadow DOM inline,
                    // so we handle it with a caretColor trick
                    caretColor: isLightColor(strokeColor) ? '#000' : '#fff',
                  }}
                  onInput={e => {
                    const el = e.target as HTMLTextAreaElement;
                    // Auto-size: reset then measure
                    el.style.height = 'auto';
                    el.style.height = el.scrollHeight + 'px';
                    // Auto-width based on content
                    el.style.width = '80px';
                    el.style.width = Math.min(300, Math.max(80, el.scrollWidth)) + 'px';
                  }}
                  onKeyDown={e => {
                    e.stopPropagation();
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      const val = (e.target as HTMLTextAreaElement).value.trim();
                      if (val) {
                        setComments(prev => [
                          ...prev,
                          {
                            x: editingComment.x,
                            y: editingComment.y,
                            text: val,
                            color: strokeColor,
                          },
                        ]);
                        actionHistory.current.push('comment');
                        setEditingComment(null);
                      }
                    }
                    if (e.key === 'Escape') {
                      setEditingComment(null);
                    }
                  }}
                />
              </div>
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
              {/* Draw / Text toggle */}
              <div style={{ display: 'flex', gap: '2px', alignItems: 'center', padding: '0 2px' }}>
                <button
                  onClick={() => {
                    setCanvasSubTool('draw');
                    setEditingComment(null);
                  }}
                  title="Draw (D)"
                  style={{
                    height: 28,
                    borderRadius: '6px',
                    border: 'none',
                    background: canvasSubTool === 'draw' ? 'rgba(139,92,246,0.25)' : 'transparent',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 4,
                    transition: 'all 0.15s ease-out',
                    padding: '0 6px',
                    color: canvasSubTool === 'draw' ? '#f1f5f9' : 'rgba(148,163,184,0.6)',
                    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                  }}>
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round">
                    <path d="M12 19l7-7 3 3-7 7-3-3z" />
                    <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
                  </svg>
                  <span
                    style={{
                      fontSize: '10px',
                      fontWeight: 500,
                      opacity: 0.5,
                      letterSpacing: '0.02em',
                    }}>
                    D
                  </span>
                </button>
                <button
                  onClick={() => setCanvasSubTool('text')}
                  title="Text comment (T)"
                  style={{
                    height: 28,
                    borderRadius: '6px',
                    border: 'none',
                    background: canvasSubTool === 'text' ? 'rgba(139,92,246,0.25)' : 'transparent',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 4,
                    transition: 'all 0.15s ease-out',
                    padding: '0 6px',
                    color: canvasSubTool === 'text' ? '#f1f5f9' : 'rgba(148,163,184,0.6)',
                    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                  }}>
                  <span style={{ fontSize: '14px', fontWeight: 700, lineHeight: 1 }}>T</span>
                  <span
                    style={{
                      fontSize: '10px',
                      fontWeight: 500,
                      opacity: 0.5,
                      letterSpacing: '0.02em',
                    }}>
                    T
                  </span>
                </button>
              </div>

              {/* Divider */}
              <div style={{ width: 1, height: 20, background: 'rgba(148,163,184,0.2)', margin: '0 2px' }} />

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
                onClick={handleCanvasUndo}
                disabled={!hasCanvasContent}
                title="Undo (⌘Z)"
                style={{
                  background: 'transparent',
                  color: !hasCanvasContent ? 'rgba(148,163,184,0.25)' : 'rgba(203,213,225,0.9)',
                  border: 'none',
                  borderRadius: '6px',
                  width: 28,
                  height: 28,
                  fontSize: '15px',
                  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                  cursor: !hasCanvasContent ? 'default' : 'pointer',
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
                onClick={handleDone}
                disabled={!hasCanvasContent}
                style={{
                  background: !hasCanvasContent ? 'rgba(124,58,237,0.2)' : 'linear-gradient(135deg, #7c3aed, #9333ea)',
                  color: !hasCanvasContent ? 'rgba(255,255,255,0.3)' : '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '5px 14px',
                  fontSize: '12px',
                  fontWeight: 600,
                  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                  cursor: !hasCanvasContent ? 'default' : 'pointer',
                  transition: 'all 0.15s ease-out',
                  whiteSpace: 'nowrap',
                  letterSpacing: '0.02em',
                }}>
                Done
              </button>
            </div>
          )}

          {/* Cancel pill - shown for select tool or pencil with no strokes */}
          {(!isPencilMode || !hasCanvasContent) && (
            <div style={styles.pillContainer}>
              <button style={styles.pill} onClick={dismiss}>
                Cancel · Esc
              </button>
            </div>
          )}

          {!isDragging.current && !isPencilMode && <div style={styles.hint}>Click and drag to select a region</div>}
          {isPencilMode && !hasCanvasContent && !isPencilDrawing.current && !editingComment && (
            <div style={styles.hint}>
              {canvasSubTool === 'text' ? 'Click to place a comment' : 'Draw on the screenshot to annotate'}
            </div>
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
