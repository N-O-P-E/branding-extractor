/* eslint-disable jsx-a11y/no-static-element-interactions, jsx-a11y/no-noninteractive-element-interactions */
import { collectBrowserMetadata } from '@extension/shared/lib/utils/browser-metadata.js';
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
  order: number;
}

interface Selection extends Region {
  color: string;
}

interface PlacedImage {
  x: number;
  y: number;
  width: number;
  height: number;
  dataUrl: string;
  naturalWidth: number;
  naturalHeight: number;
  order: number;
}

type CanvasSubTool = 'draw' | 'text' | 'image';

const isLightColor = (color: string) => color === '#FFFFFF' || color === '#F59E0B';

// Custom SVG cursors — white icons with dark drop shadow for visibility on any background
const makeCursor = (svg: string, x = 12, y = 12) => {
  const enhanced = svg
    .replace(
      'fill="none">',
      'fill="none"><defs><filter id="s" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="1" stdDeviation="1.2" flood-color="#000" flood-opacity="0.6"/></filter></defs><g filter="url(#s)">',
    )
    .replace('</svg>', '</g></svg>');
  return `url("data:image/svg+xml,${encodeURIComponent(enhanced)}") ${x} ${y}, crosshair`;
};

const CURSOR_SELECT = makeCursor(
  `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M5.7 3.75C4.623 3.75 3.75 4.623 3.75 5.7V5.75M18.25 3.75C19.355 3.75 20.25 4.645 20.25 5.75M3.75 18.25V18.3C3.75 19.377 4.623 20.25 5.7 20.25M18.25 20.25C19.355 20.25 20.25 19.355 20.25 18.25M10.25 3.75H13.75M20.25 10.25V13.75M13.75 20.25H10.25M3.75 13.75V10.25" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
);

const CURSOR_DRAW = makeCursor(
  `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M2.746 13.5C10.918 5.422 14.288 2.281 16.267 4.386C19.081 7.379 4.628 16.462 8.627 18.768C11.958 20.688 17.335 10.212 19.543 12.899C20.845 14.482 16.267 17.991 17.486 19.737C18.322 20.935 20.113 19.794 21.247 18.771" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  2,
  14,
);

const CURSOR_COMMENT = makeCursor(
  `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M15.25 9H8.75M15.25 13H8.75M9.294 18.484L11.359 20.215C11.729 20.525 12.268 20.526 12.64 20.218L14.738 18.48C14.917 18.331 15.143 18.25 15.376 18.25H18.25C19.355 18.25 20.25 17.355 20.25 16.25V5.75C20.25 4.645 19.355 3.75 18.25 3.75H5.75C4.645 3.75 3.75 4.645 3.75 5.75V16.25C3.75 17.355 4.645 18.25 5.75 18.25H8.652C8.887 18.25 9.114 18.333 9.294 18.484Z" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  4,
  20,
);

const CURSOR_IMAGE = makeCursor(
  `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M11.25 20.25H5.75C4.645 20.25 3.75 19.355 3.75 18.25V5.75C3.75 4.645 4.645 3.75 5.75 3.75H18.25C19.355 3.75 20.25 4.645 20.25 5.75V11.25" stroke="white" stroke-width="1.5" stroke-linecap="round"/><path d="M3.75 16.25L6.586 13.414C7.367 12.633 8.633 12.633 9.414 13.414L12 16" stroke="white" stroke-width="1.5" stroke-linecap="round"/><circle cx="14.5" cy="9.5" r="2" stroke="white" stroke-width="1.5"/><path d="M15.75 18.5H21.25M18.5 15.75V21.25" stroke="white" stroke-width="1.5" stroke-linecap="round"/></svg>`,
);

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

const renderPlacedImages = (
  ctx: CanvasRenderingContext2D,
  images: PlacedImage[],
  scaleX: number,
  scaleY: number,
): Promise<void> =>
  Promise.all(
    images.map(
      pi =>
        new Promise<void>(resolve => {
          const img = new Image();
          img.onload = () => {
            ctx.drawImage(img, pi.x * scaleX, pi.y * scaleY, pi.width * scaleX, pi.height * scaleY);
            // Border
            ctx.strokeStyle = 'rgba(255,255,255,0.4)';
            ctx.lineWidth = 1 * Math.max(scaleX, scaleY);
            ctx.setLineDash([]);
            ctx.strokeRect(pi.x * scaleX, pi.y * scaleY, pi.width * scaleX, pi.height * scaleY);
            resolve();
          };
          img.onerror = () => resolve();
          img.src = pi.dataUrl;
        }),
    ),
  ).then(() => {});

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
  const strokeColorRef = useRef('#8B5CF6');
  const [strokeWidth, setStrokeWidth] = useState(4);
  const [canvasSubTool, setCanvasSubTool] = useState<CanvasSubTool>('draw');
  const [comments, setComments] = useState<Comment[]>([]);
  const [editingComment, setEditingComment] = useState<{ x: number; y: number } | null>(null);
  const editingCommentRef = useRef<{ x: number; y: number } | null>(null);
  const commentInputRef = useRef<HTMLDivElement>(null);
  const [draggingCommentIndex, setDraggingCommentIndex] = useState<number | null>(null);
  const dragCommentOffset = useRef<{ dx: number; dy: number }>({ dx: 0, dy: 0 });

  // Placed images state
  const [placedImages, setPlacedImages] = useState<PlacedImage[]>([]);
  const [draggingImageIndex, setDraggingImageIndex] = useState<number | null>(null);
  const dragImageOffset = useRef<{ dx: number; dy: number }>({ dx: 0, dy: 0 });
  const [resizingImageIndex, setResizingImageIndex] = useState<number | null>(null);
  const resizeStart = useRef<{ mouseX: number; mouseY: number; w: number; h: number }>({
    mouseX: 0,
    mouseY: 0,
    w: 0,
    h: 0,
  });

  // Accumulated annotations from select/inspect tools
  const [selections, setSelections] = useState<Selection[]>([]);
  const [htmlSnippets, setHtmlSnippets] = useState<string[]>([]);

  // Inspect tool state
  const [inspectActive, setInspectActive] = useState(false);
  const [inspectHighlight, setInspectHighlight] = useState<DOMRect | null>(null);
  const [inspectElInfo, setInspectElInfo] = useState('');
  const [capturedElements, setCapturedElements] = useState<string[]>([]);
  const inspectHoveredEl = useRef<Element | null>(null);

  const backdropRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<OverlayState>('idle');
  const screenshotUrlRef = useRef<string | null>(null);
  const handleDoneRef = useRef<((shouldDismiss?: boolean) => void) | null>(null);
  const orderCounter = useRef(0);

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
    setCapturedElements([]);
    setPlacedImages([]);
    setDraggingImageIndex(null);
    setResizingImageIndex(null);
    actionHistory.current = [];
    orderCounter.current = 0;

    // Notify side panel that overlay is closed so buttons reset
    chrome.runtime.sendMessage({ type: 'TOOL_SWITCHED', payload: { tool: '' } });
  }, []);

  useEffect(() => {
    const listener = (message: ShowScreenshotMessage | ActivateToolMessage) => {
      if (message.type === 'SHOW_SCREENSHOT') {
        const tool = message.payload.tool ?? 'select';

        // If overlay is already active with content, just switch the tool
        if (stateRef.current === 'selecting' && screenshotUrlRef.current) {
          setActiveTool(tool);
          // Re-send metadata in case side panel needs it
          collectBrowserMetadata().then(metadata => {
            chrome.runtime.sendMessage({ type: 'BROWSER_METADATA', payload: metadata });
          });
          return;
        }

        setActiveTool(tool);

        if (tool === 'inspect') {
          // Inspect mode: no screenshot overlay, work on live page
          setInspectActive(true);
          setInspectHighlight(null);
          inspectHoveredEl.current = null;
          setScreenshotUrl(message.payload.screenshotDataUrl);
          // Send browser metadata for inspect mode too
          collectBrowserMetadata().then(metadata => {
            chrome.runtime.sendMessage({ type: 'BROWSER_METADATA', payload: metadata });
          });
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

        // Send browser metadata to side panel immediately
        collectBrowserMetadata().then(metadata => {
          chrome.runtime.sendMessage({ type: 'BROWSER_METADATA', payload: metadata });
        });
      }
      if (message.type === 'ACTIVATE_TOOL') {
        setActiveTool(message.payload.tool);
      }
      if (message.type === 'REQUEST_CAPTURE') {
        // Trigger capture and send CAPTURE_COMPLETE without dismissing overlay
        handleDoneRef.current?.(false);
      }
      if (message.type === 'DISMISS_OVERLAY') {
        dismiss();
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
    if (state === 'selecting') {
      redrawPencilCanvas(strokes, currentStroke);
    }
  }, [strokes, currentStroke, activeTool, state, redrawPencilCanvas]);

  const hasAnyContent = strokes.length > 0 || comments.length > 0 || selections.length > 0 || placedImages.length > 0;

  const handleDone = useCallback(
    (shouldDismiss = true) => {
      if (!screenshotUrl) return;

      const img = new Image();
      img.onload = async () => {
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
          ctx.strokeStyle = region.color;
          ctx.lineWidth = 3 * Math.max(scaleX, scaleY);
          ctx.setLineDash([8 * scaleX, 4 * scaleX]);
          ctx.strokeRect(rx, ry, rw, rh);
          ctx.fillStyle = `${region.color}20`;
          ctx.fillRect(rx, ry, rw, rh);
        }
        ctx.setLineDash([]);

        // Draw placed images, then strokes and comments on top
        renderPlacedImages(ctx, placedImages, scaleX, scaleY).then(async () => {
          renderPencilStrokes(ctx, strokes, scaleX, scaleY);
          renderComments(ctx, comments, scaleX, scaleY);

          const annotatedDataUrl = canvas.toDataURL('image/jpeg', 0.82);
          const browserMetadata = await collectBrowserMetadata();
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
              htmlSnippet:
                htmlSnippets.length > 0
                  ? htmlSnippets
                      .map((snippet, i) => {
                        const elInfo = capturedElements[i];
                        return elInfo ? `<!-- ${elInfo} -->\n${snippet}` : snippet;
                      })
                      .join('\n\n---\n\n')
                  : undefined,
              browserMetadata,
            },
          };
          chrome.runtime.sendMessage(captureMessage);
          if (shouldDismiss) dismiss();
        });
      };
      img.src = screenshotUrl;
    },
    [screenshotUrl, hasAnyContent, strokes, comments, selections, htmlSnippets, placedImages, dismiss],
  );

  // Track action order for undo: 'stroke' or 'comment'
  const actionHistory = useRef<Array<'stroke' | 'comment' | 'selection' | 'image'>>([]);

  const handleCanvasUndo = useCallback(() => {
    const lastAction = actionHistory.current.pop();
    if (lastAction === 'comment') {
      setComments(prev => prev.slice(0, -1));
    } else if (lastAction === 'stroke') {
      setStrokes(prev => prev.slice(0, -1));
    } else if (lastAction === 'selection') {
      setSelections(prev => prev.slice(0, -1));
      setHtmlSnippets(prev => prev.slice(0, -1));
      setCapturedElements(prev => prev.slice(0, -1));
    } else if (lastAction === 'image') {
      setPlacedImages(prev => prev.slice(0, -1));
    }
  }, []);

  // Helper to place an image on the canvas
  const placeImageFromDataUrl = useCallback((dataUrl: string, x?: number, y?: number) => {
    const img = new Image();
    img.onload = () => {
      // Scale down if too large (max 200px wide)
      const maxW = 200;
      const scale = img.naturalWidth > maxW ? maxW / img.naturalWidth : 1;
      const w = img.naturalWidth * scale;
      const h = img.naturalHeight * scale;
      setPlacedImages(prev => [
        ...prev,
        {
          x: x ?? 20,
          y: y ?? 20,
          width: w,
          height: h,
          dataUrl,
          naturalWidth: img.naturalWidth,
          naturalHeight: img.naturalHeight,
          order: ++orderCounter.current,
        },
      ]);
      actionHistory.current.push('image');
    };
    img.src = dataUrl;
  }, []);

  const placeImageFromFile = useCallback(
    (file: File, x?: number, y?: number) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          placeImageFromDataUrl(reader.result, x, y);
        }
      };
      reader.readAsDataURL(file);
    },
    [placeImageFromDataUrl],
  );

  // Paste handler (Cmd+V)
  useEffect(() => {
    if (state !== 'selecting') return;
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) placeImageFromFile(file);
          return;
        }
      }
    };
    document.addEventListener('paste', handlePaste, true);
    return () => document.removeEventListener('paste', handlePaste, true);
  }, [state, placeImageFromFile]);

  // Focus the backdrop when overlay opens so it receives keyboard events
  useEffect(() => {
    if (state === 'selecting' && backdropRef.current) {
      backdropRef.current.focus();
    }
  }, [state]);

  // Block keyboard events on the HOST page when overlay is active.
  // The shadow DOM init already blocks events FROM the shadow DOM,
  // but if focus is on the host page, events bypass the shadow DOM entirely.
  // This catches those and prevents them from triggering host page shortcuts.
  useEffect(() => {
    if (state === 'idle') return;
    const blockHostKeys = (e: KeyboardEvent) => {
      // Allow browser shortcuts (Cmd+T, Cmd+R, Cmd+W, etc.)
      if ((e.metaKey || e.ctrlKey) && e.key !== 'z') return;
      // Allow F-keys
      if (e.key.startsWith('F') && e.key.length <= 3) return;
      // Block everything else from reaching host page handlers
      e.stopPropagation();
    };
    // Use bubble phase on document so it fires AFTER the shadow DOM's
    // capture-phase interception — this only catches events that
    // originated on the host page (not from shadow DOM)
    document.addEventListener('keydown', blockHostKeys, false);
    document.addEventListener('keyup', blockHostKeys, false);
    return () => {
      document.removeEventListener('keydown', blockHostKeys, false);
      document.removeEventListener('keyup', blockHostKeys, false);
    };
  }, [state]);

  // Keyboard shortcuts — attached to backdrop ref so they work inside shadow DOM
  useEffect(() => {
    if (state === 'idle') return;
    const el = backdropRef.current;
    if (!el) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Cmd+Escape closes the overlay entirely
        if (e.metaKey) {
          dismiss();
          return;
        }
        // Plain Escape cancels current action (e.g. editing comment)
        if (editingCommentRef.current) {
          setEditingComment(null);
          return;
        }
        return;
      }
      // Undo (all modes)
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault();
        handleCanvasUndo();
        return;
      }

      // Check if user is actively typing in a textarea or contentEditable (comment input)
      const target = e.target as HTMLElement;
      const active = (el.getRootNode() as ShadowRoot)?.activeElement as HTMLElement | null;
      const isTyping =
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'INPUT' ||
        target.isContentEditable ||
        active?.tagName === 'TEXTAREA' ||
        active?.tagName === 'INPUT' ||
        active?.isContentEditable ||
        !!editingCommentRef.current;

      // D/S/C/I tool switching (when not typing)
      if (!isTyping) {
        if (e.key === 'd' || e.key === 'D') {
          e.preventDefault();
          setActiveTool('pencil');
          setCanvasSubTool('draw');
          setEditingComment(null);
          chrome.runtime.sendMessage({ type: 'TOOL_SWITCHED', payload: { tool: 'pencil' } });
          return;
        }
        if (e.key === 'c' || e.key === 'C') {
          e.preventDefault();
          setActiveTool('pencil');
          setCanvasSubTool('text');
          setEditingComment(null);
          chrome.runtime.sendMessage({ type: 'TOOL_SWITCHED', payload: { tool: 'pencil' } });
          return;
        }
        if (e.key === 'i' || e.key === 'I') {
          e.preventDefault();
          setActiveTool('pencil');
          setCanvasSubTool('image');
          setEditingComment(null);
          chrome.runtime.sendMessage({ type: 'TOOL_SWITCHED', payload: { tool: 'pencil' } });
          return;
        }
        if (e.key === 's' || e.key === 'S') {
          e.preventDefault();
          setActiveTool('select');
          setEditingComment(null);
          chrome.runtime.sendMessage({ type: 'TOOL_SWITCHED', payload: { tool: 'select' } });
          return;
        }
      }
    };
    // Use capture phase on the backdrop element
    el.addEventListener('keydown', handleKeyDown, true);
    return () => el.removeEventListener('keydown', handleKeyDown, true);
  }, [state, dismiss, handleCanvasUndo, handleDone]);

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
          color: strokeColorRef.current,
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

      // Stay on select tool so user can make additional selections
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

  // Image dragging
  useEffect(() => {
    if (draggingImageIndex === null) return;
    const handleMouseMove = (e: MouseEvent) => {
      if (!imgRef.current) return;
      const rect = imgRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left - dragImageOffset.current.dx;
      const y = e.clientY - rect.top - dragImageOffset.current.dy;
      setPlacedImages(prev => prev.map((pi, i) => (i === draggingImageIndex ? { ...pi, x, y } : pi)));
    };
    const handleMouseUp = () => setDraggingImageIndex(null);
    document.addEventListener('mousemove', handleMouseMove, true);
    document.addEventListener('mouseup', handleMouseUp, true);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove, true);
      document.removeEventListener('mouseup', handleMouseUp, true);
    };
  }, [draggingImageIndex]);

  // Image resizing
  useEffect(() => {
    if (resizingImageIndex === null) return;
    const handleMouseMove = (e: MouseEvent) => {
      const dx = e.clientX - resizeStart.current.mouseX;
      // Maintain aspect ratio based on horizontal movement
      const newW = Math.max(30, resizeStart.current.w + dx);
      const aspect = resizeStart.current.h / resizeStart.current.w;
      const newH = newW * aspect;
      setPlacedImages(prev =>
        prev.map((pi, i) => (i === resizingImageIndex ? { ...pi, width: newW, height: newH } : pi)),
      );
    };
    const handleMouseUp = () => setResizingImageIndex(null);
    document.addEventListener('mousemove', handleMouseMove, true);
    document.addEventListener('mouseup', handleMouseUp, true);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove, true);
      document.removeEventListener('mouseup', handleMouseUp, true);
    };
  }, [resizingImageIndex]);

  // Inspect tool: highlight elements on hover, capture on click
  useEffect(() => {
    if (!inspectActive) return;

    const handleMouseMove = (e: MouseEvent) => {
      // Get element under cursor (skip our own overlay elements)
      const el = document.elementFromPoint(e.clientX, e.clientY);
      if (!el || el.closest('[data-vir-inspect]')) {
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

      // Get HTML snippet (minified)
      const tag = el.tagName.toLowerCase();
      let html = el.outerHTML
        .replace(/\n\s*\n/g, '\n')
        .replace(/^\s+/gm, '  ')
        .replace(/\s{2,}/g, ' ')
        .replace(/>\s+</g, '>\n  <')
        .trim();
      if (html.length > 1500) {
        const tagMatch = html.match(/^<[^>]+>/);
        if (tagMatch) {
          const inner = (el.textContent ?? '').trim().slice(0, 200);
          html = `${tagMatch[0]}\n  ${inner}${inner.length >= 200 ? '...' : ''}\n</${tag}>`;
        } else {
          html = html.slice(0, 1500) + '...';
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
          color: strokeColorRef.current,
        },
      ]);
      setHtmlSnippets(prev => [...prev, html]);
      actionHistory.current.push('selection');

      // Store element info for display (reuses `tag` from above)
      const elId = el.id ? `#${el.id}` : '';
      const classes = [...el.classList]
        .slice(0, 3)
        .map(c => `.${c.length > 25 ? c.slice(0, 25) + '…' : c}`)
        .join('');
      const size = `${Math.round(rect.width)}×${Math.round(rect.height)}`;
      setCapturedElements(prev => [...prev, `${tag}${elId}${classes} · ${size}`]);

      // Exit inspect mode, enter canvas overlay with captured element
      setInspectActive(false);
      setInspectHighlight(null);
      inspectHoveredEl.current = null;
      setActiveTool('pencil');
      setCanvasSubTool('text');
      setState('selecting');
      chrome.runtime.sendMessage({ type: 'TOOL_SWITCHED', payload: { tool: 'pencil' } });
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Plain Escape exits inspect mode; Cmd+Escape handled by backdrop handler
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
        if (canvasSubTool === 'image') {
          // Open file picker on click
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = 'image/*';
          input.onchange = () => {
            const file = input.files?.[0];
            if (file) placeImageFromFile(file, pos.x, pos.y);
          };
          input.click();
          return;
        }
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
    [state, activeTool, strokeColor, strokeWidth, canvasSubTool, placeImageFromFile],
  );

  strokeColorRef.current = strokeColor;
  stateRef.current = state;
  screenshotUrlRef.current = screenshotUrl;
  editingCommentRef.current = editingComment;
  handleDoneRef.current = handleDone;
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
      // Don't dismiss if there's existing content
      if (activeTool === 'pencil' && (strokes.length > 0 || comments.length > 0)) return;
      if (activeTool === 'select' && selections.length > 0) return;
      dismiss();
    }
  };

  const hasCanvasContent = strokes.length > 0 || comments.length > 0 || selections.length > 0;

  const isPencilMode = activeTool === 'pencil' && state === 'selecting';

  // Detect Shopify preview bar and measure its height to position toolbar above it
  const getToolbarBottom = (): string => {
    if (typeof document === 'undefined') return '24px';
    // Shopify preview bar is typically an iframe or div at the bottom
    const previewBar =
      document.querySelector('#PBarNextFrameWrapper') ??
      document.querySelector('#preview-bar-iframe') ??
      document.querySelector('[id*="preview-bar"]') ??
      document.querySelector('iframe[src*="preview_bar"]') ??
      document.querySelector('iframe[src*="preview-bar"]');
    if (previewBar) {
      const rect = previewBar.getBoundingClientRect();
      if (rect.bottom > window.innerHeight - 120) {
        return `${window.innerHeight - rect.top + 16}px`;
      }
    }
    // Fallback: if URL has preview_theme_id, assume a bar exists
    if (window.location.search.includes('preview_theme_id')) {
      return '110px';
    }
    return '24px';
  };
  const toolbarBottom = getToolbarBottom();

  // Shared comment pill styles — used by both saved comments and the editing textarea
  const commentPillStyle: React.CSSProperties = {
    padding: '6px 10px',
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 500,
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    border: '1px solid rgba(255,255,255,0.3)',
    lineHeight: '18px',
    boxSizing: 'border-box',
  };

  return (
    <>
      {/* Inspect mode: inject cursor style on the page */}
      {inspectActive && <style>{`* { cursor: ${CURSOR_SELECT.replace(/"/g, "'")} !important; }`}</style>}

      {/* Inspect mode highlight overlay */}
      {inspectActive && inspectHighlight && (
        <div
          data-vir-inspect
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
          data-vir-inspect
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
              <span style={{ opacity: 0.5 }}>Click to select · ⌘Esc to close</span>
            </>
          ) : (
            <>
              Click an element to report · <span style={{ opacity: 0.5 }}>⌘Esc to close</span>
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
            if (e.key === 'Escape' && e.metaKey) {
              dismiss();
            }
            e.stopPropagation();
          }}
          onKeyUp={e => e.stopPropagation()}
          onKeyPress={e => e.stopPropagation()}>
          <button style={styles.closeButton} onClick={dismiss} aria-label="Close overlay">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M6.25 6.25L17.75 17.75M17.75 6.25L6.25 17.75"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>

          {/* Captured element info bar */}
          {capturedElements.length > 0 && (
            <div
              style={{
                position: 'absolute',
                top: 16,
                left: 60,
                right: 60,
                display: 'flex',
                flexWrap: 'wrap',
                gap: 6,
                justifyContent: 'center',
                zIndex: 2,
                pointerEvents: 'none',
              }}>
              {capturedElements.map((info, i) => (
                <div
                  key={i}
                  style={{
                    background: '#1e293b',
                    border: '1px solid rgba(148,163,184,0.2)',
                    borderRadius: 8,
                    padding: '5px 12px',
                    fontSize: 11,
                    fontFamily: 'monospace, monospace',
                    color: '#c4b5fd',
                    boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
                    whiteSpace: 'nowrap',
                  }}>
                  {info}
                </div>
              ))}
            </div>
          )}

          <div
            style={styles.screenshotContainer}
            onClick={e => e.stopPropagation()}
            role="presentation"
            onDragOver={e => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onDrop={e => {
              e.preventDefault();
              e.stopPropagation();
              const file = e.dataTransfer.files[0];
              if (file?.type.startsWith('image/')) {
                const rect = imgRef.current?.getBoundingClientRect();
                const x = rect ? e.clientX - rect.left : 20;
                const y = rect ? e.clientY - rect.top : 20;
                placeImageFromFile(file, x, y);
              }
            }}>
            <img
              ref={imgRef}
              src={screenshotUrl}
              alt="Page screenshot"
              style={{
                ...styles.screenshot,
                cursor:
                  activeTool === 'select'
                    ? CURSOR_SELECT
                    : isPencilMode && canvasSubTool === 'draw'
                      ? CURSOR_DRAW
                      : isPencilMode && canvasSubTool === 'text'
                        ? CURSOR_COMMENT
                        : isPencilMode && canvasSubTool === 'image'
                          ? CURSOR_IMAGE
                          : 'crosshair',
              }}
              draggable={false}
              onMouseDown={handleMouseDown}
              onLoad={() => forceRender(n => n + 1)}
            />

            {/* Drawing overlay canvas (visible in all modes to show strokes) */}
            {state === 'selecting' && (
              <canvas
                ref={pencilCanvasRef}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  pointerEvents: 'none',
                  zIndex: 5,
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
                    border: `2px dashed ${sel.color}`,
                    backgroundColor: `${sel.color}20`,
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
                  border: `2px dashed ${strokeColor}`,
                  backgroundColor: `${strokeColor}20`,
                  pointerEvents: 'none',
                }}
              />
            )}

            {/* Placed images */}
            {state === 'selecting' &&
              placedImages.map((pi, i) => (
                <div
                  key={`img-${i}`}
                  onMouseDown={e => {
                    e.stopPropagation();
                    e.preventDefault();
                    dragImageOffset.current = {
                      dx: e.clientX - (imgRef.current?.getBoundingClientRect().left ?? 0) - pi.x,
                      dy: e.clientY - (imgRef.current?.getBoundingClientRect().top ?? 0) - pi.y,
                    };
                    setDraggingImageIndex(i);
                  }}
                  style={{
                    position: 'absolute',
                    left: pi.x,
                    top: pi.y,
                    width: pi.width,
                    height: pi.height,
                    cursor: draggingImageIndex === i ? 'grabbing' : 'grab',
                    userSelect: 'none',
                    zIndex: draggingImageIndex === i ? 9999 : pi.order + 10,
                    border: '1px solid rgba(255,255,255,0.4)',
                    borderRadius: 4,
                    overflow: 'hidden',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                  }}>
                  <img
                    src={pi.dataUrl}
                    alt=""
                    draggable={false}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  />
                  {/* Resize handle — diagonal grip lines */}
                  <div
                    onMouseDown={e => {
                      e.stopPropagation();
                      e.preventDefault();
                      resizeStart.current = { mouseX: e.clientX, mouseY: e.clientY, w: pi.width, h: pi.height };
                      setResizingImageIndex(i);
                    }}
                    style={{
                      position: 'absolute',
                      right: -1,
                      bottom: -1,
                      width: 16,
                      height: 16,
                      cursor: 'nwse-resize',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                      <path d="M9 1L1 9" stroke="rgba(255,255,255,0.6)" strokeWidth="1.5" strokeLinecap="round" />
                      <path d="M9 5L5 9" stroke="rgba(255,255,255,0.6)" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  </div>
                </div>
              ))}

            {/* Placed comment bubbles (visible in all modes) */}
            {state === 'selecting' &&
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
                    ...commentPillStyle,
                    position: 'absolute',
                    left: comment.x,
                    top: comment.y,
                    background: comment.color,
                    color: isLightColor(comment.color) ? '#000' : '#fff',
                    whiteSpace: 'pre-wrap',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                    maxWidth: 300,
                    cursor: draggingCommentIndex === i ? 'grabbing' : 'grab',
                    userSelect: 'none',
                    zIndex: draggingCommentIndex === i ? 9999 : comment.order + 10,
                  }}>
                  {comment.text}
                </div>
              ))}

            {/* Editing comment input */}
            {state === 'selecting' && editingComment && (
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
                <div
                  ref={commentInputRef}
                  contentEditable
                  suppressContentEditableWarning
                  data-placeholder="Comment…"
                  style={{
                    ...commentPillStyle,
                    background: strokeColor,
                    color: isLightColor(strokeColor) ? '#000' : '#fff',
                    outline: 'none',
                    minWidth: 60,
                    boxShadow: '0 2px 12px rgba(0,0,0,0.3)',
                    whiteSpace: 'pre',
                    cursor: 'text',
                    caretColor: isLightColor(strokeColor) ? '#000' : '#fff',
                    maxWidth: 400,
                    wordBreak: 'break-word',
                  }}
                  onKeyDown={e => {
                    e.stopPropagation();
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      const val = (e.target as HTMLDivElement).textContent?.trim() ?? '';
                      if (val) {
                        setComments(prev => [
                          ...prev,
                          {
                            x: editingComment.x,
                            y: editingComment.y,
                            text: val,
                            color: strokeColor,
                            order: ++orderCounter.current,
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
                <style>{`
                  [data-placeholder]:empty::before {
                    content: attr(data-placeholder);
                    color: ${isLightColor(strokeColor) ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.45)'};
                    pointer-events: none;
                  }
                `}</style>
              </div>
            )}
          </div>

          {/* Floating toolbar — Figma-style (visible in all overlay modes) */}
          {state === 'selecting' && (
            <div
              style={{
                position: 'fixed',
                bottom: toolbarBottom,
                left: '50%',
                transform: 'translateX(-50%)',
                display: 'flex',
                gap: '4px',
                padding: '8px 14px',
                background: '#1e293b',
                border: '1px solid rgba(148,163,184,0.2)',
                borderRadius: '14px',
                boxShadow: '0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(0,0,0,0.1)',
                fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                zIndex: 2147483647,
                alignItems: 'center',
              }}
              onClick={e => e.stopPropagation()}
              onKeyDown={e => e.stopPropagation()}>
              {/* Tool toggle: Select area / Draw / Text */}
              <div style={{ display: 'flex', gap: '2px', alignItems: 'center', padding: '0 2px' }}>
                {/* Select area */}
                <button
                  onClick={() => {
                    setActiveTool('select');
                    setEditingComment(null);
                    chrome.runtime.sendMessage({ type: 'TOOL_SWITCHED', payload: { tool: 'select' } });
                  }}
                  title="Select area (S)"
                  style={{
                    height: 34,
                    borderRadius: '8px',
                    border: 'none',
                    background: activeTool === 'select' ? 'rgba(139,92,246,0.25)' : 'transparent',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 4,
                    transition: 'all 0.15s ease-out',
                    padding: '0 6px',
                    color: activeTool === 'select' ? '#f1f5f9' : 'rgba(148,163,184,0.6)',
                    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                  }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path
                      d="M5.7 3.75V3.75C4.62304 3.75 3.75 4.62305 3.75 5.7V5.75M18.25 3.75V3.75C19.3546 3.75 20.25 4.64543 20.25 5.75V5.75M3.75 18.25V18.3C3.75 19.377 4.62304 20.25 5.7 20.25V20.25M18.25 20.25V20.25C19.3546 20.25 20.25 19.3546 20.25 18.25V18.25M10.25 3.75H13.75M20.25 10.25V13.75M13.75 20.25H10.25M3.75 13.75V10.25"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <span style={{ fontSize: '11px', fontWeight: 500, opacity: 0.5 }}>S</span>
                </button>
                <button
                  onClick={() => {
                    setActiveTool('pencil');
                    setCanvasSubTool('draw');
                    setEditingComment(null);
                    chrome.runtime.sendMessage({ type: 'TOOL_SWITCHED', payload: { tool: 'pencil' } });
                  }}
                  title="Draw (D)"
                  style={{
                    height: 34,
                    borderRadius: '8px',
                    border: 'none',
                    background:
                      activeTool === 'pencil' && canvasSubTool === 'draw' ? 'rgba(139,92,246,0.25)' : 'transparent',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 4,
                    transition: 'all 0.15s ease-out',
                    padding: '0 6px',
                    color: activeTool === 'pencil' && canvasSubTool === 'draw' ? '#f1f5f9' : 'rgba(148,163,184,0.6)',
                    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                  }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path
                      d="M2.74609 13.5C10.9181 5.42183 14.2879 2.28083 16.2674 4.38617C19.0814 7.37874 4.62803 16.4615 8.62659 18.7676C11.9582 20.6876 17.3347 10.2123 19.5427 12.899C20.8453 14.4822 16.2674 17.9913 17.4862 19.7373C18.3221 20.9346 20.1133 19.7937 21.2468 18.7714"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
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
                  onClick={() => {
                    setActiveTool('pencil');
                    setCanvasSubTool('text');
                    chrome.runtime.sendMessage({ type: 'TOOL_SWITCHED', payload: { tool: 'pencil' } });
                  }}
                  title="Comment (C)"
                  style={{
                    height: 34,
                    borderRadius: '8px',
                    border: 'none',
                    background:
                      activeTool === 'pencil' && canvasSubTool === 'text' ? 'rgba(139,92,246,0.25)' : 'transparent',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 4,
                    transition: 'all 0.15s ease-out',
                    padding: '0 6px',
                    color: activeTool === 'pencil' && canvasSubTool === 'text' ? '#f1f5f9' : 'rgba(148,163,184,0.6)',
                    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                  }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path
                      d="M15.25 9H8.75M15.25 13H8.75M9.29422 18.4836L11.3593 20.2147C11.7292 20.5248 12.2679 20.5263 12.6397 20.2183L14.738 18.4799C14.9173 18.3313 15.143 18.25 15.3759 18.25H18.25C19.3546 18.25 20.25 17.3546 20.25 16.25V5.75C20.25 4.64543 19.3546 3.75 18.25 3.75H5.75C4.64543 3.75 3.75 4.64543 3.75 5.75V16.25C3.75 17.3546 4.64543 18.25 5.75 18.25H8.65182C8.88675 18.25 9.11418 18.3327 9.29422 18.4836Z"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <span
                    style={{
                      fontSize: '10px',
                      fontWeight: 500,
                      opacity: 0.5,
                      letterSpacing: '0.02em',
                    }}>
                    C
                  </span>
                </button>
                <button
                  onClick={() => {
                    setActiveTool('pencil');
                    setCanvasSubTool('image');
                    chrome.runtime.sendMessage({ type: 'TOOL_SWITCHED', payload: { tool: 'pencil' } });
                  }}
                  title="Image (I)"
                  style={{
                    height: 34,
                    borderRadius: '8px',
                    border: 'none',
                    background:
                      activeTool === 'pencil' && canvasSubTool === 'image' ? 'rgba(139,92,246,0.25)' : 'transparent',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 4,
                    transition: 'all 0.15s ease-out',
                    padding: '0 6px',
                    color: activeTool === 'pencil' && canvasSubTool === 'image' ? '#f1f5f9' : 'rgba(148,163,184,0.6)',
                    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                  }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path
                      d="M11.25 20.25H5.75C4.64543 20.25 3.75 19.3546 3.75 18.25V5.75C3.75 4.64543 4.64543 3.75 5.75 3.75H18.25C19.3546 3.75 20.25 4.64543 20.25 5.75V11.25"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                    <path
                      d="M3.75 16.25L6.58579 13.4142C7.36683 12.6332 8.63317 12.6332 9.41421 13.4142L12 16"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                    <path
                      d="M14.5 11.5C15.6046 11.5 16.5 10.6046 16.5 9.5C16.5 8.39543 15.6046 7.5 14.5 7.5C13.3954 7.5 12.5 8.39543 12.5 9.5C12.5 10.6046 13.3954 11.5 14.5 11.5Z"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    />
                    <path d="M15.75 18.5H21.25" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    <path d="M18.5 15.75V21.25" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                  <span style={{ fontSize: '11px', fontWeight: 500, opacity: 0.5 }}>I</span>
                </button>
              </div>

              {/* Divider */}
              <div style={{ width: 1, height: 24, background: 'rgba(148,163,184,0.2)', margin: '0 6px' }} />

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
              <div style={{ width: 1, height: 24, background: 'rgba(148,163,184,0.2)', margin: '0 6px' }} />

              {/* Color swatches */}
              <div style={{ display: 'flex', gap: '3px', alignItems: 'center', padding: '0 4px' }}>
                {STROKE_COLORS.map(color => (
                  <button
                    key={color}
                    onClick={() => setStrokeColor(color)}
                    title={color}
                    style={{
                      width: 24,
                      height: 24,
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
              <div style={{ width: 1, height: 24, background: 'rgba(148,163,184,0.2)', margin: '0 6px' }} />

              {/* Undo */}
              <button
                onClick={handleCanvasUndo}
                disabled={!hasCanvasContent}
                title="Undo (⌘Z)"
                style={{
                  background: 'transparent',
                  color: !hasCanvasContent ? 'rgba(148,163,184,0.25)' : 'rgba(203,213,225,0.9)',
                  border: 'none',
                  borderRadius: '8px',
                  width: 34,
                  height: 34,
                  fontSize: '15px',
                  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                  cursor: !hasCanvasContent ? 'default' : 'pointer',
                  transition: 'all 0.15s ease-out',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 0,
                }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path
                    d="M6.49985 5L3.20696 8.29289C2.81643 8.68342 2.81643 9.31658 3.20696 9.70711L6.49985 13"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M4 9H17.25C19.4591 9 21.25 10.7909 21.25 13V14.25C21.25 16.4591 19.4591 18.25 17.25 18.25H11.75"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </div>
          )}

          {/* Cancel pill - shown when no content yet */}
          {!hasCanvasContent && (
            <div style={styles.pillContainer}>
              <button style={styles.pill} onClick={dismiss}>
                Cancel · Esc
              </button>
            </div>
          )}

          {activeTool === 'select' && !isDragging.current && !hasCanvasContent && (
            <div style={styles.hint}>Click and drag to select a region</div>
          )}
          {isPencilMode && !hasCanvasContent && !isPencilDrawing.current && !editingComment && (
            <div style={styles.hint}>
              {canvasSubTool === 'text'
                ? 'Click to place a comment'
                : canvasSubTool === 'image'
                  ? 'Click to upload, drag & drop, or ⌘V to paste an image'
                  : 'Draw on the screenshot to annotate'}
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
