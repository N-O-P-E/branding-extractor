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
    return <p className="py-2 text-xs text-gray-400">No spacing values found.</p>;
  }

  const pxValues = spacing.map(s => toPx(s.value) ?? 0);
  const maxPx = Math.max(...pxValues, 1);

  return (
    <div className="flex flex-col divide-y divide-gray-100">
      {spacing.map((s, index) => {
        const px = pxValues[index] ?? 0;
        const barWidth = Math.max(4, Math.round((px / maxPx) * MAX_BAR_PX));

        return (
          <button
            key={s.value}
            type="button"
            onClick={() => onCopy(s.value)}
            className="group flex items-center gap-3 rounded px-1 py-2 text-left transition-colors hover:bg-gray-50"
            title={`${s.value} — used ${s.usageCount}x on: ${s.properties.join(', ')}`}>
            {/* Proportional visual box */}
            <span
              className="shrink-0 rounded-sm bg-indigo-200 transition-all group-hover:bg-indigo-300"
              style={{ width: barWidth, height: 16 }}
              aria-hidden="true"
            />

            {/* Value label */}
            <span className="w-12 shrink-0 font-mono text-[11px] text-gray-700">{s.value}</span>

            {/* Properties list */}
            <span className="min-w-0 flex-1 truncate text-[10px] text-gray-400">{s.properties.join(', ')}</span>

            {/* Usage count */}
            <span className="shrink-0 text-[9px] text-gray-300 transition-colors group-hover:text-gray-400">
              {s.usageCount}×
            </span>
          </button>
        );
      })}
    </div>
  );
};
