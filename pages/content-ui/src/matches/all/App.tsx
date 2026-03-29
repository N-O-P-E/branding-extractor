import { useCallback, useEffect, useRef, useState } from 'react';

interface HighlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface TooltipInfo {
  tag: string;
  classes: string;
  dimensions: string;
  x: number;
  y: number;
}

const App = () => {
  const [active, setActive] = useState(false);
  const [highlight, setHighlight] = useState<HighlightRect | null>(null);
  const [tooltip, setTooltip] = useState<TooltipInfo | null>(null);
  const hoveredRef = useRef<Element | null>(null);

  // Listen for activate/deactivate messages from side panel
  useEffect(() => {
    const handler = (message: { type: string }) => {
      if (message.type === 'ACTIVATE_INSPECTOR') {
        setActive(true);
      }
      if (message.type === 'DEACTIVATE_INSPECTOR') {
        setActive(false);
        setHighlight(null);
        setTooltip(null);
        hoveredRef.current = null;
      }
    };
    chrome.runtime.onMessage.addListener(handler);
    return () => chrome.runtime.onMessage.removeListener(handler);
  }, []);

  // Handle mouse movement over the page
  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!active) return;

      // Get element under cursor, ignoring our overlay
      const el = document.elementFromPoint(e.clientX, e.clientY);
      if (!el || el === hoveredRef.current) return;
      hoveredRef.current = el;

      const rect = el.getBoundingClientRect();
      setHighlight({
        top: rect.top + window.scrollY,
        left: rect.left + window.scrollX,
        width: rect.width,
        height: rect.height,
      });

      const tag = el.tagName.toLowerCase();
      const classes =
        el.className && typeof el.className === 'string'
          ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.')
          : '';

      setTooltip({
        tag,
        classes,
        dimensions: `${Math.round(rect.width)} × ${Math.round(rect.height)}`,
        x: e.clientX,
        y: e.clientY,
      });
    },
    [active],
  );

  // Handle click to select element
  const handleClick = useCallback(
    (e: MouseEvent) => {
      if (!active || !hoveredRef.current) return;
      e.preventDefault();
      e.stopPropagation();

      const el = hoveredRef.current;
      const computed = getComputedStyle(el);
      const tag = el.tagName.toLowerCase();
      const firstClass = el.classList[0];
      const selector = el.id ? `${tag}#${el.id}` : firstClass ? `${tag}.${firstClass}` : tag;

      // Read relevant computed styles
      const styleProps = [
        'color',
        'background-color',
        'font-family',
        'font-size',
        'font-weight',
        'line-height',
        'letter-spacing',
        'padding',
        'padding-top',
        'padding-right',
        'padding-bottom',
        'padding-left',
        'margin',
        'margin-top',
        'margin-right',
        'margin-bottom',
        'margin-left',
        'border',
        'border-radius',
        'box-shadow',
        'display',
        'position',
        'width',
        'height',
      ];

      const computedStyles: Record<string, string> = {};
      for (const prop of styleProps) {
        const val = computed.getPropertyValue(prop);
        if (val) computedStyles[prop] = val;
      }

      // Send to side panel
      chrome.runtime.sendMessage({
        type: 'ELEMENT_SELECTED',
        payload: { selector, computedStyles, linkedTokens: {} },
      });

      // Deactivate inspector after selection
      setActive(false);
      setHighlight(null);
      setTooltip(null);
      hoveredRef.current = null;
    },
    [active],
  );

  // Attach/detach document event listeners
  useEffect(() => {
    if (active) {
      document.addEventListener('mousemove', handleMouseMove, true);
      document.addEventListener('click', handleClick, true);
    }
    return () => {
      document.removeEventListener('mousemove', handleMouseMove, true);
      document.removeEventListener('click', handleClick, true);
    };
  }, [active, handleMouseMove, handleClick]);

  if (!active) return null;

  return (
    <>
      {/* Full-screen overlay to capture events */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          zIndex: 2147483646,
          cursor: 'crosshair',
          pointerEvents: 'none',
        }}
      />

      {/* Highlight box */}
      {highlight && (
        <div
          style={{
            position: 'absolute',
            top: highlight.top,
            left: highlight.left,
            width: highlight.width,
            height: highlight.height,
            backgroundColor: 'rgba(139, 92, 246, 0.15)',
            border: '2px solid rgba(139, 92, 246, 0.6)',
            borderRadius: '2px',
            pointerEvents: 'none',
            zIndex: 2147483646,
          }}
        />
      )}

      {/* Tooltip */}
      {tooltip && (
        <div
          style={{
            position: 'fixed',
            top: tooltip.y + 20,
            left: tooltip.x + 12,
            backgroundColor: '#0f172a',
            color: '#f1f5f9',
            padding: '4px 8px',
            borderRadius: '4px',
            fontSize: '12px',
            fontFamily: 'monospace',
            pointerEvents: 'none',
            zIndex: 2147483647,
            whiteSpace: 'nowrap',
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
          }}>
          <span style={{ color: '#a78bfa' }}>{tooltip.tag}</span>
          {tooltip.classes && <span style={{ color: '#94a3b8' }}>{tooltip.classes}</span>}
          <span style={{ color: '#64748b', marginLeft: '8px' }}>{tooltip.dimensions}</span>
        </div>
      )}
    </>
  );
};

export default App;
