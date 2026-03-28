import { useState } from 'react';
import type { ExtractedSpacing, TokenOverride } from '@extension/extractor';

interface Props {
  spacing: ExtractedSpacing[];
  overrides: Map<string, TokenOverride>;
  onOverride: (override: TokenOverride) => void;
  onResetOverride: (tokenId: string) => void;
  onCopy: (value: string) => void;
}

const MAX_BAR_PX = 64;

const toPx = (value: string): number | null => {
  const n = parseFloat(value);
  if (isNaN(n)) return null;
  if (value.endsWith('rem')) return n * 16;
  if (value.endsWith('em')) return n * 16;
  if (value.endsWith('px') || /^\d/.test(value)) return n;
  return null;
};

const getTokenId = (value: string): string => `spacing-${value}`;

const SpacingEditor = ({ spacing, overrides, onOverride, onResetOverride, onCopy }: Props) => {
  const [editingId, setEditingId] = useState<string | null>(null);

  if (spacing.length === 0) {
    return (
      <p className="py-2 text-xs" style={{ color: 'var(--text-muted)' }}>
        No spacing values found.
      </p>
    );
  }

  const allPxValues = spacing.map(s => {
    const tokenId = getTokenId(s.value);
    const override = overrides.get(tokenId);
    const displayValue = override?.modifiedValue ?? s.value;
    return toPx(displayValue) ?? 0;
  });
  const maxPx = Math.max(...allPxValues, 1);

  const handleValueChange = (s: ExtractedSpacing, rawInput: string) => {
    const n = parseFloat(rawInput);
    if (isNaN(n) || n < 0) return;
    const tokenId = getTokenId(s.value);
    const newValue = `${n}px`;
    onOverride({
      tokenId,
      originalValue: s.value,
      modifiedValue: newValue,
      type: 'computed',
      selectors: s.selectors,
    });
  };

  return (
    <div className="flex flex-col">
      {spacing.map((s, index) => {
        const tokenId = getTokenId(s.value);
        const override = overrides.get(tokenId);
        const displayValue = override?.modifiedValue ?? s.value;
        const isModified = override !== undefined;
        const px = allPxValues[index] ?? 0;
        const barWidth = Math.max(4, Math.round((px / maxPx) * MAX_BAR_PX));
        const isEditing = editingId === tokenId;

        return (
          <div
            key={s.value}
            className="flex items-center gap-3 rounded px-1 py-2"
            style={{ borderBottom: '1px solid var(--border-subtle)' }}>
            {/* Proportional visual bar */}
            <span
              className="shrink-0 rounded-sm transition-all"
              style={{
                width: barWidth,
                height: 16,
                backgroundColor: 'var(--accent-primary)',
                opacity: 0.6,
                minWidth: 4,
              }}
              onMouseEnter={e => ((e.currentTarget as HTMLSpanElement).style.opacity = '1')}
              onMouseLeave={e => ((e.currentTarget as HTMLSpanElement).style.opacity = '0.6')}
              aria-hidden="true"
            />

            {/* Editable value */}
            <span className="flex w-16 shrink-0 items-center gap-0.5">
              {isModified && (
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: 'var(--accent-primary)' }}
                  aria-label="Modified"
                />
              )}
              {isEditing ? (
                <input
                  type="number"
                  defaultValue={parseFloat(displayValue) || 0}
                  min={0}
                  ref={el => el?.focus()}
                  onBlur={e => {
                    handleValueChange(s, e.target.value);
                    setEditingId(null);
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.currentTarget.blur();
                    } else if (e.key === 'Escape') {
                      setEditingId(null);
                    }
                  }}
                  className="w-12 rounded px-1 font-mono text-[11px] outline-none"
                  style={{
                    background: 'var(--bg-input)',
                    border: '1px solid var(--border-input)',
                    color: 'var(--text-secondary)',
                  }}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setEditingId(tokenId)}
                  className="font-mono text-[11px] transition-opacity hover:opacity-70"
                  style={{ color: 'var(--text-secondary)' }}
                  title={`Click to edit — original: ${s.value}`}>
                  {displayValue}
                </button>
              )}
            </span>

            {/* Properties list */}
            <span className="min-w-0 flex-1 truncate text-[10px]" style={{ color: 'var(--text-muted)' }}>
              {s.properties.join(', ')}
            </span>

            {/* Right side: usage + copy + reset */}
            <span className="flex shrink-0 flex-col items-end gap-1">
              <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>
                {s.usageCount}×
              </span>
              <button
                type="button"
                onClick={() => onCopy(displayValue)}
                className="text-[9px] transition-opacity hover:opacity-70"
                style={{ color: 'var(--text-muted)' }}
                title={`Copy ${displayValue}`}>
                Copy
              </button>
              {isModified && (
                <button
                  type="button"
                  onClick={() => onResetOverride(tokenId)}
                  className="text-[9px] transition-opacity hover:opacity-70"
                  style={{ color: 'var(--status-error)' }}
                  title={`Reset to ${s.value}`}>
                  Reset
                </button>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
};

export { SpacingEditor };
