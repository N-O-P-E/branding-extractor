import { useMemo, useState } from 'react';
import type { ExtractedTypography } from '@extension/extractor';

interface Props {
  typography: ExtractedTypography[];
  onCopy: (value: string) => void;
}

const normalizeFamilyName = (fontFamily: string): string => fontFamily.split(',')[0].replace(/['"]/g, '').trim();

const buildCssString = (t: ExtractedTypography): string =>
  [
    `font-family: ${t.fontFamily};`,
    `font-size: ${t.fontSize};`,
    `font-weight: ${t.fontWeight};`,
    `line-height: ${t.lineHeight};`,
    t.letterSpacing !== 'normal' && t.letterSpacing !== '0px' ? `letter-spacing: ${t.letterSpacing};` : '',
  ]
    .filter(Boolean)
    .join('\n');

// ─── FamilyGroupReadOnly ─────────────────────────────────────────────────────

interface FamilyGroupReadOnlyProps {
  family: string;
  entries: ExtractedTypography[];
  onCopy: (value: string) => void;
}

const FamilyGroupReadOnly = ({ family, entries, onCopy }: FamilyGroupReadOnlyProps) => {
  const [expanded, setExpanded] = useState(true);
  const totalUsage = entries.reduce((sum, e) => sum + e.usageCount, 0);

  return (
    <div
      className="rounded-lg"
      style={{
        border: '1px solid var(--border-subtle)',
        marginBottom: '8px',
        overflow: 'hidden',
      }}>
      {/* Family header */}
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        aria-expanded={expanded}
        className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left transition-colors"
        style={{ background: 'var(--bg-secondary)' }}
        onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-hover)')}
        onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-secondary)')}>
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

        {/* Font preview */}
        <span
          className="shrink-0 font-mono text-[13px] leading-none"
          style={{ fontFamily: family, color: 'var(--text-primary)', minWidth: '24px' }}
          aria-hidden="true">
          Aa
        </span>

        {/* Family name */}
        <span
          className="min-w-0 flex-1 truncate text-xs font-semibold"
          style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-heading)' }}>
          {family}
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

        {/* Variant count */}
        <span className="shrink-0 font-mono text-[9px]" style={{ color: 'var(--text-muted)' }}>
          {entries.length} variant{entries.length !== 1 ? 's' : ''}
        </span>
      </button>

      {/* Variant rows */}
      {expanded && (
        <div>
          {entries.map((t, idx) => {
            const label = t.element ? `<${t.element}>` : null;
            const key = `${t.fontFamily}-${t.fontSize}-${t.fontWeight}-${idx}`;

            return (
              <button
                key={key}
                type="button"
                onClick={() => onCopy(buildCssString(t))}
                title="Click to copy CSS"
                className="flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left transition-colors"
                style={{
                  borderTop: '1px solid var(--border-subtle)',
                  background: 'transparent',
                }}
                onMouseEnter={e =>
                  ((e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--bg-secondary)')
                }
                onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent')}>
                {/* Spacing indent */}
                <span className="shrink-0 text-[9px]" style={{ color: 'var(--border-subtle)' }}>
                  └
                </span>

                {/* Size / weight / lh */}
                <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                  <span className="font-mono text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                    {t.fontSize}
                  </span>
                  <span className="font-mono text-[9px]" style={{ color: 'var(--text-muted)' }}>
                    /
                  </span>
                  <span className="font-mono text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                    {t.fontWeight}
                  </span>
                  <span className="font-mono text-[9px]" style={{ color: 'var(--text-muted)' }}>
                    lh {t.lineHeight}
                  </span>
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
                </span>

                {/* Usage + copy hint */}
                <span className="flex shrink-0 flex-col items-end gap-0.5">
                  <span className="font-mono text-[9px]" style={{ color: 'var(--text-muted)' }}>
                    {t.usageCount}×
                  </span>
                  <span
                    className="text-[9px] opacity-0 transition-opacity group-hover:opacity-100"
                    style={{ color: 'var(--text-muted)' }}>
                    Copy
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ─── TypographyList ──────────────────────────────────────────────────────────

const TypographyList = ({ typography, onCopy }: Props) => {
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
        <FamilyGroupReadOnly key={family} family={family} entries={entries} onCopy={onCopy} />
      ))}
    </div>
  );
};

export { TypographyList };
