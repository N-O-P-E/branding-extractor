import type { ExtractedSpacing } from '@extension/extractor';

interface Props {
  spacing: ExtractedSpacing[];
  onCopy: (value: string) => void;
}

/**
 * Parse a CSS length string to a pixel number for proportional box sizing.
 * Returns null for non-pixel-convertible values (e.g. percentages).
 */
const toPx = (value: string): number | null => {
  const n = parseFloat(value);
  if (isNaN(n)) return null;
  if (value.endsWith('rem')) return n * 16;
  if (value.endsWith('em')) return n * 16;
  if (value.endsWith('px') || /^\d/.test(value)) return n;
  return null;
};

const MAX_BAR_PX = 64; // visual cap so bars don't overflow

export const SpacingGrid = ({ spacing, onCopy }: Props) => {
  if (spacing.length === 0) {
    return (
      <p className="py-2 text-xs" style={{ color: 'var(--text-muted)' }}>
        No spacing values found.
      </p>
    );
  }

  const pxValues = spacing.map(s => toPx(s.value) ?? 0);
  const maxPx = Math.max(...pxValues, 1);

  return (
    <div className="flex flex-col">
      {spacing.map((s, index) => {
        const px = pxValues[index] ?? 0;
        const barWidth = Math.max(4, Math.round((px / maxPx) * MAX_BAR_PX));

        return (
          <button
            key={s.value}
            type="button"
            onClick={() => onCopy(s.value)}
            className="group flex items-center gap-3 rounded px-1 py-2 text-left transition-colors"
            onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--bg-secondary)')}
            onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent')}
            style={{ borderBottom: '1px solid var(--border-subtle)' }}
            title={`${s.value} — used ${s.usageCount}x on: ${s.properties.join(', ')}`}>
            {/* Proportional visual bar */}
            <span
              className="shrink-0 rounded-sm transition-all"
              style={{
                width: barWidth,
                height: 16,
                backgroundColor: 'var(--accent-primary)',
                opacity: 0.6,
              }}
              onMouseEnter={e => ((e.currentTarget as HTMLSpanElement).style.opacity = '1')}
              onMouseLeave={e => ((e.currentTarget as HTMLSpanElement).style.opacity = '0.6')}
              aria-hidden="true"
            />

            {/* Value label */}
            <span className="w-12 shrink-0 font-mono text-[11px]" style={{ color: 'var(--text-secondary)' }}>
              {s.value}
            </span>

            {/* Properties list */}
            <span className="min-w-0 flex-1 truncate text-[10px]" style={{ color: 'var(--text-muted)' }}>
              {s.properties.join(', ')}
            </span>

            {/* Usage count */}
            <span className="shrink-0 text-[9px]" style={{ color: 'var(--text-muted)' }}>
              {s.usageCount}×
            </span>
          </button>
        );
      })}
    </div>
  );
};
