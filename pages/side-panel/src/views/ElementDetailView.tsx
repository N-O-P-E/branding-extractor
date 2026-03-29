import { useRef, useState } from 'react';
import type { TokenOverride } from '@extension/extractor';

interface Props {
  selector: string;
  computedStyles: Record<string, string>;
  linkedTokens: Record<string, string>;
  overrides: Map<string, TokenOverride>;
  onOverride: (override: TokenOverride) => void;
  onResetOverride: (tokenId: string) => void;
  onBack: () => void;
}

type StyleCategory = 'color' | 'typography' | 'spacing' | 'layout' | 'border';

interface CategoryDef {
  id: StyleCategory;
  label: string;
  properties: string[];
}

const CATEGORIES: CategoryDef[] = [
  {
    id: 'color',
    label: 'Color',
    properties: ['color', 'background-color'],
  },
  {
    id: 'typography',
    label: 'Typography',
    properties: ['font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing'],
  },
  {
    id: 'spacing',
    label: 'Spacing',
    properties: [
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
    ],
  },
  {
    id: 'layout',
    label: 'Layout',
    properties: ['display', 'position', 'width', 'height'],
  },
  {
    id: 'border',
    label: 'Border',
    properties: ['border', 'border-radius', 'box-shadow'],
  },
];

const COLOR_PROPS = new Set(['color', 'background-color']);

const isColorValue = (prop: string, value: string): boolean => {
  if (!COLOR_PROPS.has(prop)) return false;
  return value !== 'transparent' && value !== 'rgba(0, 0, 0, 0)' && value.length > 0;
};

// Attempt to convert rgb(...) / rgba(...) to #rrggbb for the color input
const toHex = (value: string): string => {
  const rgb = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!rgb) return '#000000';
  const r = parseInt(rgb[1], 10).toString(16).padStart(2, '0');
  const g = parseInt(rgb[2], 10).toString(16).padStart(2, '0');
  const b = parseInt(rgb[3], 10).toString(16).padStart(2, '0');
  return `#${r}${g}${b}`;
};

const makeTokenId = (selector: string, prop: string): string =>
  `element-${selector.replace(/[^a-z0-9]/gi, '_')}-${prop}`;

const ElementDetailView = ({ selector, computedStyles, overrides, onOverride, onResetOverride, onBack }: Props) => {
  const [editingProp, setEditingProp] = useState<string | null>(null);
  const colorInputRefs = useRef<Map<string, HTMLInputElement>>(new Map());

  const getDisplayValue = (prop: string): string => {
    const tokenId = makeTokenId(selector, prop);
    return overrides.get(tokenId)?.modifiedValue ?? computedStyles[prop] ?? '';
  };

  const handleTextEdit = (prop: string, newValue: string) => {
    if (!newValue.trim()) return;
    const original = computedStyles[prop] ?? '';
    const tokenId = makeTokenId(selector, prop);
    onOverride({
      tokenId,
      originalValue: original,
      modifiedValue: newValue.trim(),
      type: 'computed',
      selectors: [selector],
    });
  };

  const handleColorChange = (prop: string, newHex: string) => {
    const original = computedStyles[prop] ?? '';
    const tokenId = makeTokenId(selector, prop);
    onOverride({
      tokenId,
      originalValue: original,
      modifiedValue: newHex,
      type: 'computed',
      selectors: [selector],
    });
  };

  const handleResetProp = (prop: string) => {
    const tokenId = makeTokenId(selector, prop);
    onResetOverride(tokenId);
  };

  const renderPropertyRow = (prop: string) => {
    const rawValue = computedStyles[prop];
    if (!rawValue) return null;

    const displayValue = getDisplayValue(prop);
    const tokenId = makeTokenId(selector, prop);
    const isModified = overrides.has(tokenId);
    const isEditing = editingProp === prop;
    const isColor = isColorValue(prop, displayValue);
    const hexValue = isColor ? toHex(displayValue) : '';

    return (
      <div
        key={prop}
        className="flex items-center gap-2 px-1 py-1.5"
        style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        {/* Property name */}
        <span
          className="w-28 shrink-0 truncate font-mono text-[10px]"
          style={{ color: 'var(--text-muted)' }}
          title={prop}>
          {prop}
        </span>

        {/* Value area */}
        <span className="flex min-w-0 flex-1 items-center gap-1.5">
          {isModified && (
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: 'var(--accent-primary)' }}
              aria-label="Modified"
            />
          )}

          {isColor && (
            <>
              {/* Hidden native color picker */}
              <input
                type="color"
                ref={el => {
                  if (el) {
                    colorInputRefs.current.set(prop, el);
                  } else {
                    colorInputRefs.current.delete(prop);
                  }
                }}
                value={hexValue}
                onChange={e => handleColorChange(prop, e.target.value)}
                className="sr-only absolute"
                tabIndex={-1}
                aria-hidden="true"
              />
              {/* Color swatch */}
              <button
                type="button"
                onClick={() => colorInputRefs.current.get(prop)?.click()}
                className="h-4 w-4 shrink-0 rounded ring-1 ring-white/10 transition-transform hover:scale-110"
                style={{ backgroundColor: displayValue }}
                title={`Click to edit color: ${displayValue}`}
                aria-label={`Edit color ${prop}`}
              />
            </>
          )}

          {isEditing && !isColor ? (
            <input
              type="text"
              defaultValue={displayValue}
              ref={el => el?.focus()}
              onBlur={e => {
                handleTextEdit(prop, e.target.value);
                setEditingProp(null);
              }}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.currentTarget.blur();
                } else if (e.key === 'Escape') {
                  setEditingProp(null);
                }
              }}
              className="min-w-0 flex-1 rounded px-1 font-mono text-[11px] outline-none"
              style={{
                background: 'var(--bg-input)',
                border: '1px solid var(--border-input)',
                color: 'var(--text-secondary)',
              }}
            />
          ) : (
            <button
              type="button"
              onClick={() => !isColor && setEditingProp(prop)}
              className="min-w-0 flex-1 truncate text-left font-mono text-[11px]"
              style={{
                color: 'var(--text-secondary)',
                cursor: isColor ? 'default' : 'text',
              }}
              title={isColor ? displayValue : `Click to edit: ${displayValue}`}>
              {displayValue}
            </button>
          )}
        </span>

        {/* Reset */}
        {isModified && (
          <button
            type="button"
            onClick={() => handleResetProp(prop)}
            className="shrink-0 text-[9px] transition-opacity hover:opacity-70"
            style={{ color: 'var(--status-error)' }}
            title={`Reset to ${rawValue}`}>
            Reset
          </button>
        )}
      </div>
    );
  };

  const renderedCategories = CATEGORIES.map(cat => {
    const rows = cat.properties.map(p => renderPropertyRow(p)).filter(Boolean);
    if (rows.length === 0) return null;

    return (
      <div key={cat.id} className="mb-3">
        <p
          className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wider"
          style={{ color: 'var(--text-muted)' }}>
          {cat.label}
        </p>
        <div
          className="overflow-hidden rounded-lg"
          style={{ border: '1px solid var(--border-default)', backgroundColor: 'var(--bg-secondary)' }}>
          {rows}
        </div>
      </div>
    );
  });

  return (
    <>
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: '1px solid var(--border-default)' }}>
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to extraction"
          className="rounded p-1 transition-colors"
          style={{ color: 'var(--text-muted)' }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--bg-secondary)';
            (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
            (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)';
          }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path
              d="M10 12L6 8l4-4"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>

        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
            Element Inspector
          </p>
          <p className="truncate font-mono text-[10px]" style={{ color: 'var(--accent-subtle)' }} title={selector}>
            {selector}
          </p>
        </div>
      </div>

      {/* Style categories */}
      <div className="flex-1 overflow-y-auto p-4">{renderedCategories}</div>
    </>
  );
};

export { ElementDetailView };
