import { useMemo, useState } from 'react';
import type { ExtractedTypography, TokenOverride } from '@extension/extractor';

interface Props {
  typography: ExtractedTypography[];
  overrides: Map<string, TokenOverride>;
  onOverride: (override: TokenOverride) => void;
  onResetOverride: (tokenId: string) => void;
  onCopy: (value: string) => void;
}

const normalizeFamilyName = (fontFamily: string): string => fontFamily.split(',')[0].replace(/['"]/g, '').trim();

const getFamilyTokenId = (family: string): string => `font-family-${family}`;
const getSizeTokenId = (size: string): string => `font-size-${size}`;
const getWeightTokenId = (weight: string): string => `font-weight-${weight}`;

const buildCssString = (t: ExtractedTypography, overrides: Map<string, TokenOverride>): string => {
  const family = normalizeFamilyName(t.fontFamily);
  const resolvedFamily = overrides.get(getFamilyTokenId(family))?.modifiedValue ?? t.fontFamily;
  const resolvedSize = overrides.get(getSizeTokenId(t.fontSize))?.modifiedValue ?? t.fontSize;
  const resolvedWeight = overrides.get(getWeightTokenId(t.fontWeight))?.modifiedValue ?? t.fontWeight;

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

// ─── FamilyGroup ────────────────────────────────────────────────────────────

const COMMON_FONTS = [
  'Arial',
  'Helvetica',
  'Georgia',
  'Times New Roman',
  'Verdana',
  'Tahoma',
  'Trebuchet MS',
  'Courier New',
  'system-ui',
  'sans-serif',
  'serif',
  'monospace',
] as const;

interface FamilyGroupProps {
  family: string;
  entries: ExtractedTypography[];
  allFamilies: string[];
  overrides: Map<string, TokenOverride>;
  onOverride: (override: TokenOverride) => void;
  onResetOverride: (tokenId: string) => void;
  onCopy: (value: string) => void;
}

const FamilyGroup = ({
  family,
  entries,
  allFamilies,
  overrides,
  onOverride,
  onResetOverride,
  onCopy,
}: FamilyGroupProps) => {
  const [expanded, setExpanded] = useState(true);
  const [showFontPicker, setShowFontPicker] = useState(false);

  const familyTokenId = getFamilyTokenId(family);
  const familyOverride = overrides.get(familyTokenId);
  const displayFamily = familyOverride?.modifiedValue ?? family;

  const totalUsage = entries.reduce((sum, e) => sum + e.usageCount, 0);

  const handleFamilyChange = (newFamily: string) => {
    if (!newFamily || newFamily === family) return;
    // Apply family override to all selectors across all variants in the group
    const allSelectors = Array.from(new Set(entries.flatMap(e => e.selectors)));
    onOverride({
      tokenId: familyTokenId,
      originalValue: entries[0]?.fontFamily ?? family,
      modifiedValue: newFamily,
      type: 'computed',
      selectors: allSelectors,
    });
  };

  const handleResetFamily = () => onResetOverride(familyTokenId);

  const handleSizeChange = (t: ExtractedTypography, newSize: string) => {
    const px = parseFloat(newSize);
    if (isNaN(px)) return;
    onOverride({
      tokenId: getSizeTokenId(t.fontSize),
      originalValue: t.fontSize,
      modifiedValue: `${px}px`,
      type: 'computed',
      selectors: t.selectors,
    });
  };

  return (
    <div
      className="rounded-lg"
      style={{
        border: '1px solid var(--border-subtle)',
        marginBottom: '8px',
        overflow: 'hidden',
      }}>
      {/* Family header row */}
      <div className="flex items-center gap-2 px-3 py-2" style={{ background: 'var(--bg-secondary)' }}>
        {/* Expand/collapse toggle */}
        <button
          type="button"
          onClick={() => setExpanded(v => !v)}
          aria-label={expanded ? 'Collapse variants' : 'Expand variants'}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 text-left transition-opacity hover:opacity-70">
          {/* Chevron */}
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            fill="none"
            aria-hidden="true"
            style={{
              transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
              transition: 'transform 0.15s ease',
              flexShrink: 0,
              color: 'var(--text-muted)',
            }}>
            <path
              d="M3.5 2l3 3-3 3"
              stroke="currentColor"
              strokeWidth="1.25"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>

          {/* Font preview + family name */}
          <span
            className="shrink-0 font-mono text-[13px] leading-none"
            style={{
              fontFamily: displayFamily,
              color: 'var(--text-primary)',
              minWidth: '24px',
            }}
            aria-hidden="true">
            Aa
          </span>

          <span
            className="min-w-0 flex-1 truncate font-mono text-xs font-semibold"
            style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-heading)' }}>
            {displayFamily}
            {familyOverride && (
              <span className="ml-1.5 font-sans text-[9px] font-normal" style={{ color: 'var(--text-muted)' }}>
                was {family}
              </span>
            )}
          </span>

          {/* Total usage badge */}
          <span
            className="shrink-0 rounded-full px-1.5 py-0.5 font-mono text-[9px] leading-none"
            style={{
              background: 'var(--accent-10)',
              color: 'var(--accent-subtle)',
              border: '1px solid var(--accent-20)',
            }}>
            {totalUsage}×
          </span>
        </button>

        {/* Change Font dropdown / button */}
        {showFontPicker ? (
          <select
            value={displayFamily}
            onChange={e => {
              handleFamilyChange(e.target.value);
              setShowFontPicker(false);
            }}
            onBlur={() => setShowFontPicker(false)}
            ref={el => el?.focus()}
            className="min-w-0 max-w-[140px] rounded px-1.5 py-0.5 font-mono text-[11px] outline-none"
            style={{
              background: 'var(--bg-input)',
              border: '1px solid var(--accent-primary)',
              color: 'var(--text-secondary)',
            }}
            aria-label="Choose font family">
            {/* Page fonts */}
            <optgroup label="Page fonts">
              {allFamilies.map(f => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </optgroup>
            {/* System fonts */}
            <optgroup label="System fonts">
              {COMMON_FONTS.filter(f => !allFamilies.includes(f)).map(f => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </optgroup>
          </select>
        ) : (
          <button
            type="button"
            onClick={() => setShowFontPicker(true)}
            className="shrink-0 cursor-pointer rounded px-2 py-0.5 text-[10px] font-medium transition-colors"
            style={{
              border: '1px solid var(--border-default)',
              color: 'var(--text-secondary)',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--accent-primary)';
              (e.currentTarget as HTMLButtonElement).style.color = 'var(--accent-subtle)';
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--accent-10)';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-default)';
              (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)';
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
            }}>
            Change Font
          </button>
        )}

        {familyOverride && (
          <button
            type="button"
            onClick={handleResetFamily}
            title="Reset font family override"
            className="shrink-0 cursor-pointer text-[9px] transition-opacity hover:opacity-70"
            style={{ color: 'var(--status-error)' }}>
            Reset
          </button>
        )}
      </div>

      {/* Variant rows — grouped by font size */}
      {expanded && (
        <div>
          {(() => {
            // Group entries by original font size
            const sizeGroups = new Map<string, ExtractedTypography[]>();
            for (const entry of entries) {
              const group = sizeGroups.get(entry.fontSize) ?? [];
              group.push(entry);
              sizeGroups.set(entry.fontSize, group);
            }
            // Sort groups by combined usage count descending
            const sortedGroups = Array.from(sizeGroups.entries()).sort(
              (a, b) => b[1].reduce((s, e) => s + e.usageCount, 0) - a[1].reduce((s, e) => s + e.usageCount, 0),
            );

            return sortedGroups.map(([fontSize, groupEntries], idx) => {
              const sizeTokenId = getSizeTokenId(fontSize);
              const sizeOverride = overrides.get(sizeTokenId);
              const displaySize = sizeOverride?.modifiedValue ?? fontSize;
              const isModified = sizeOverride !== undefined;
              const totalUsage = groupEntries.reduce((s, e) => s + e.usageCount, 0);

              // Collect unique weights and elements
              const uniqueWeights = Array.from(new Set(groupEntries.map(e => e.fontWeight))).sort(
                (a, b) => Number(a) - Number(b),
              );
              const uniqueElements = Array.from(new Set(groupEntries.map(e => e.element).filter(Boolean)));
              // Most common line height
              const lhCounts = new Map<string, number>();
              for (const e of groupEntries) {
                lhCounts.set(e.lineHeight, (lhCounts.get(e.lineHeight) ?? 0) + e.usageCount);
              }
              const primaryLh = Array.from(lhCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';

              return (
                <div
                  key={`${fontSize}-${idx}`}
                  className="flex items-center gap-2 px-3 py-1.5"
                  style={{
                    borderTop: '1px solid var(--border-subtle)',
                    background: idx % 2 === 0 ? 'transparent' : 'rgba(148, 163, 184, 0.02)',
                  }}>
                  {/* Modified dot */}
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: isModified ? 'var(--accent-primary)' : 'transparent' }}
                    aria-label={isModified ? 'Modified' : undefined}
                  />

                  {/* Size group details */}
                  <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                    {/* Size input */}
                    <input
                      type="number"
                      value={parseFloat(displaySize) || 0}
                      min={1}
                      max={200}
                      onChange={e => handleSizeChange(groupEntries[0], e.target.value)}
                      className="w-12 rounded px-1 font-mono text-[10px] outline-none"
                      style={{
                        background: 'var(--bg-input)',
                        border: '1px solid var(--border-input)',
                        color: 'var(--text-muted)',
                      }}
                      title="Font size (px)"
                      aria-label="Font size in pixels"
                    />
                    <span className="font-mono text-[9px]" style={{ color: 'var(--text-muted)' }}>
                      px
                    </span>

                    {/* Weights */}
                    <span className="font-mono text-[9px]" style={{ color: 'var(--text-muted)' }}>
                      {uniqueWeights.join(' · ')}
                    </span>

                    {/* Line height */}
                    <span className="font-mono text-[9px]" style={{ color: 'var(--text-muted)' }}>
                      lh {primaryLh}
                    </span>

                    {/* Element tag badges */}
                    {uniqueElements.map(el => (
                      <span
                        key={el}
                        className="rounded px-1 py-0.5 font-mono text-[9px]"
                        style={{
                          background: 'var(--accent-10)',
                          color: 'var(--accent-subtle)',
                          border: '1px solid var(--accent-20)',
                        }}>
                        {`<${el}>`}
                      </span>
                    ))}
                  </span>

                  {/* Right actions */}
                  <span className="flex shrink-0 flex-col items-end gap-0.5">
                    <span className="font-mono text-[9px]" style={{ color: 'var(--text-muted)' }}>
                      {totalUsage}×
                    </span>
                    <button
                      type="button"
                      onClick={() => onCopy(buildCssString(groupEntries[0], overrides))}
                      className="cursor-pointer text-[9px] transition-opacity hover:opacity-70"
                      style={{ color: 'var(--text-muted)' }}
                      title="Copy CSS">
                      Copy
                    </button>
                    {isModified && (
                      <button
                        type="button"
                        onClick={() => onResetOverride(sizeTokenId)}
                        className="cursor-pointer text-[9px] transition-opacity hover:opacity-70"
                        style={{ color: 'var(--status-error)' }}
                        title="Reset size override">
                        Reset
                      </button>
                    )}
                  </span>
                </div>
              );
            });
          })()}
        </div>
      )}
    </div>
  );
};

// ─── TypographyEditor ────────────────────────────────────────────────────────

const TypographyEditor = ({ typography, overrides, onOverride, onResetOverride, onCopy }: Props) => {
  // Group entries by normalized font family, sorted by total usage count descending
  const grouped = useMemo(() => {
    const map = new Map<string, ExtractedTypography[]>();
    for (const entry of typography) {
      const family = normalizeFamilyName(entry.fontFamily);
      const existing = map.get(family) ?? [];
      existing.push(entry);
      map.set(family, existing);
    }
    return Array.from(map.entries()).sort(
      (a, b) => b[1].reduce((sum, e) => sum + e.usageCount, 0) - a[1].reduce((sum, e) => sum + e.usageCount, 0),
    );
  }, [typography]);

  const allFamilies = useMemo(() => grouped.map(([family]) => family), [grouped]);

  if (typography.length === 0) {
    return (
      <p className="py-2 text-xs" style={{ color: 'var(--text-muted)' }}>
        No typography styles found.
      </p>
    );
  }

  return (
    <div className="flex flex-col">
      {grouped.map(([family, entries]) => (
        <FamilyGroup
          key={family}
          family={family}
          allFamilies={allFamilies}
          entries={entries}
          overrides={overrides}
          onOverride={onOverride}
          onResetOverride={onResetOverride}
          onCopy={onCopy}
        />
      ))}
    </div>
  );
};

export { TypographyEditor };
