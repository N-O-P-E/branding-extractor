import { useState } from 'react';
import type { ExtractedTypography, TokenOverride } from '@extension/extractor';

interface Props {
  typography: ExtractedTypography[];
  overrides: Map<string, TokenOverride>;
  onOverride: (override: TokenOverride) => void;
  onResetOverride: (tokenId: string) => void;
  onCopy: (value: string) => void;
}

const WEIGHT_OPTIONS = [300, 400, 500, 600, 700] as const;

const getTokenId = (field: 'family' | 'size' | 'weight', value: string): string => {
  if (field === 'family') return `font-family-${value}`;
  if (field === 'size') return `font-size-${value}`;
  return `font-weight-${value}`;
};

const TypographyEditor = ({ typography, overrides, onOverride, onResetOverride, onCopy }: Props) => {
  const [editingFamily, setEditingFamily] = useState<string | null>(null);

  if (typography.length === 0) {
    return (
      <p className="py-2 text-xs" style={{ color: 'var(--text-muted)' }}>
        No typography styles found.
      </p>
    );
  }

  const handleFamilyChange = (t: ExtractedTypography, newFamily: string) => {
    const originalFamily = t.fontFamily.split(',')[0].replace(/['"]/g, '').trim();
    const tokenId = getTokenId('family', originalFamily);
    onOverride({
      tokenId,
      originalValue: t.fontFamily,
      modifiedValue: newFamily,
      type: 'computed',
      selectors: t.selectors,
    });
  };

  const handleSizeChange = (t: ExtractedTypography, newSize: string) => {
    const tokenId = getTokenId('size', t.fontSize);
    const px = parseFloat(newSize);
    if (isNaN(px)) return;
    const value = `${px}px`;
    onOverride({
      tokenId,
      originalValue: t.fontSize,
      modifiedValue: value,
      type: 'computed',
      selectors: t.selectors,
    });
  };

  const handleWeightChange = (t: ExtractedTypography, newWeight: string) => {
    const tokenId = getTokenId('weight', t.fontWeight);
    onOverride({
      tokenId,
      originalValue: t.fontWeight,
      modifiedValue: newWeight,
      type: 'computed',
      selectors: t.selectors,
    });
  };

  const buildCssString = (t: ExtractedTypography): string => {
    const originalFamily = t.fontFamily.split(',')[0].replace(/['"]/g, '').trim();
    const familyTokenId = getTokenId('family', originalFamily);
    const sizeTokenId = getTokenId('size', t.fontSize);
    const weightTokenId = getTokenId('weight', t.fontWeight);

    const resolvedFamily = overrides.get(familyTokenId)?.modifiedValue ?? t.fontFamily;
    const resolvedSize = overrides.get(sizeTokenId)?.modifiedValue ?? t.fontSize;
    const resolvedWeight = overrides.get(weightTokenId)?.modifiedValue ?? t.fontWeight;

    return [
      `font-family: ${resolvedFamily};`,
      `font-size: ${resolvedSize};`,
      `font-weight: ${resolvedWeight};`,
      `line-height: ${t.lineHeight};`,
      t.letterSpacing !== 'normal' && t.letterSpacing !== '0px' ? `letter-spacing: ${t.letterSpacing};` : '',
    ]
      .filter(Boolean)
      .join('\n');
  };

  return (
    <div className="flex flex-col" style={{ borderColor: 'var(--border-subtle)' }}>
      {typography.map((t, index) => {
        const originalFamily = t.fontFamily.split(',')[0].replace(/['"]/g, '').trim();
        const familyTokenId = getTokenId('family', originalFamily);
        const sizeTokenId = getTokenId('size', t.fontSize);
        const weightTokenId = getTokenId('weight', t.fontWeight);

        const familyOverride = overrides.get(familyTokenId);
        const sizeOverride = overrides.get(sizeTokenId);
        const weightOverride = overrides.get(weightTokenId);

        const displayFamily = familyOverride?.modifiedValue ?? originalFamily;
        const displaySize = sizeOverride?.modifiedValue ?? t.fontSize;
        const displayWeight = weightOverride?.modifiedValue ?? t.fontWeight;

        const isModified = familyOverride !== undefined || sizeOverride !== undefined || weightOverride !== undefined;
        const label = t.element ? `<${t.element}>` : null;
        const rowKey = `${t.fontFamily}-${t.fontSize}-${t.fontWeight}-${index}`;
        const isFamilyEditing = editingFamily === rowKey;

        return (
          <div
            key={rowKey}
            className="flex items-center gap-3 rounded px-1 py-2"
            style={{ borderBottom: '1px solid var(--border-subtle)' }}>
            {/* Live preview */}
            <span
              className="w-16 shrink-0 overflow-hidden whitespace-nowrap leading-none"
              style={{
                fontFamily: displayFamily,
                fontSize: Math.min(parseInt(displaySize, 10), 22) + 'px',
                fontWeight: displayWeight,
                lineHeight: t.lineHeight,
                letterSpacing: t.letterSpacing,
                textOverflow: 'ellipsis',
                display: 'block',
                color: 'var(--text-primary)',
              }}
              aria-hidden="true">
              Aa
            </span>

            {/* Editable fields */}
            <span className="flex min-w-0 flex-1 flex-col gap-1.5">
              {/* Font family input */}
              <span className="flex items-center gap-1">
                {isModified && (
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: 'var(--accent-primary)' }}
                    aria-label="Modified"
                  />
                )}
                {isFamilyEditing ? (
                  <input
                    type="text"
                    defaultValue={displayFamily}
                    ref={el => el?.focus()}
                    onBlur={e => {
                      const val = e.target.value.trim();
                      if (val && val !== originalFamily) {
                        handleFamilyChange(t, val);
                      }
                      setEditingFamily(null);
                    }}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.currentTarget.blur();
                      } else if (e.key === 'Escape') {
                        setEditingFamily(null);
                      }
                    }}
                    className="min-w-0 flex-1 truncate rounded px-1 font-mono text-[11px] outline-none"
                    style={{
                      background: 'var(--bg-input)',
                      border: '1px solid var(--border-input)',
                      color: 'var(--text-secondary)',
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setEditingFamily(rowKey)}
                    className="min-w-0 flex-1 truncate text-left font-mono text-[11px] transition-opacity hover:opacity-70"
                    style={{ color: 'var(--text-secondary)' }}
                    title="Click to edit font family">
                    {displayFamily}
                    {familyOverride && (
                      <span className="ml-1 font-sans text-[9px]" style={{ color: 'var(--text-muted)' }}>
                        (was {originalFamily})
                      </span>
                    )}
                  </button>
                )}
              </span>

              {/* Size + weight row */}
              <span className="flex items-center gap-2">
                {/* Font size */}
                <input
                  type="number"
                  value={parseFloat(displaySize) || 0}
                  min={1}
                  max={200}
                  onChange={e => handleSizeChange(t, e.target.value)}
                  className="w-14 rounded px-1 font-mono text-[10px] outline-none"
                  style={{
                    background: 'var(--bg-input)',
                    border: '1px solid var(--border-input)',
                    color: 'var(--text-muted)',
                  }}
                  title="Font size (px)"
                />
                <span className="font-mono text-[9px]" style={{ color: 'var(--text-muted)' }}>
                  px
                </span>

                {/* Font weight */}
                <select
                  value={displayWeight}
                  onChange={e => handleWeightChange(t, e.target.value)}
                  className="rounded px-1 font-mono text-[10px] outline-none"
                  style={{
                    background: 'var(--bg-input)',
                    border: '1px solid var(--border-input)',
                    color: 'var(--text-muted)',
                  }}
                  title="Font weight">
                  {WEIGHT_OPTIONS.map(w => (
                    <option key={w} value={String(w)}>
                      {w}
                    </option>
                  ))}
                </select>

                {/* lh label */}
                <span className="font-mono text-[10px]" style={{ color: 'var(--text-muted)' }}>
                  lh {t.lineHeight}
                </span>
              </span>
            </span>

            {/* Right badges */}
            <span className="flex shrink-0 flex-col items-end gap-1">
              {label && (
                <span
                  className="rounded px-1 py-0.5 font-mono text-[9px]"
                  style={{
                    background: 'var(--accent-10)',
                    color: 'var(--accent-subtle)',
                    border: '1px solid var(--accent-20)',
                  }}>
                  {label}
                </span>
              )}
              <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>
                {t.usageCount}×
              </span>
              <button
                type="button"
                onClick={() => onCopy(buildCssString(t))}
                className="text-[9px] transition-opacity hover:opacity-70"
                style={{ color: 'var(--text-muted)' }}
                title="Copy CSS">
                Copy
              </button>
              {isModified && (
                <button
                  type="button"
                  onClick={() => {
                    if (familyOverride) onResetOverride(familyTokenId);
                    if (sizeOverride) onResetOverride(sizeTokenId);
                    if (weightOverride) onResetOverride(weightTokenId);
                  }}
                  className="text-[9px] transition-opacity hover:opacity-70"
                  style={{ color: 'var(--status-error)' }}
                  title="Reset all changes for this entry">
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

export { TypographyEditor };
