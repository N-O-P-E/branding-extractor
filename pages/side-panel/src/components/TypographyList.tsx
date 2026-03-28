import type { ExtractedTypography } from '@extension/extractor';

interface Props {
  typography: ExtractedTypography[];
  onCopy: (value: string) => void;
}

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

export const TypographyList = ({ typography, onCopy }: Props) => {
  if (typography.length === 0) {
    return <p className="py-2 text-xs text-gray-400">No typography styles found.</p>;
  }

  return (
    <div className="flex flex-col divide-y divide-gray-100">
      {typography.map((t, index) => {
        const css = buildCssString(t);
        const label = t.element ? `<${t.element}>` : null;

        return (
          <button
            key={index}
            type="button"
            onClick={() => onCopy(css)}
            className="group flex items-center gap-3 rounded px-1 py-2 text-left transition-colors hover:bg-gray-50"
            title="Click to copy CSS">
            {/* Preview text rendered in the actual style */}
            <span
              className="shrink-0 leading-none text-gray-800"
              style={{
                fontFamily: t.fontFamily,
                fontSize: Math.min(parseInt(t.fontSize, 10), 22) + 'px',
                fontWeight: t.fontWeight,
                lineHeight: t.lineHeight,
                letterSpacing: t.letterSpacing,
                width: '64px',
                overflow: 'hidden',
                whiteSpace: 'nowrap',
                textOverflow: 'ellipsis',
                display: 'block',
              }}
              aria-hidden="true">
              Aa
            </span>

            {/* Details */}
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate font-mono text-[11px] text-gray-700">
                {t.fontFamily.split(',')[0].replace(/['"]/g, '').trim()}
              </span>
              <span className="font-mono text-[10px] text-gray-400">
                {t.fontSize} / {t.fontWeight} / lh {t.lineHeight}
              </span>
            </span>

            {/* Right-side badges */}
            <span className="flex shrink-0 flex-col items-end gap-1">
              {label && (
                <span className="rounded bg-gray-100 px-1 py-0.5 font-mono text-[9px] text-gray-500">{label}</span>
              )}
              <span className="text-[9px] text-gray-300 transition-colors group-hover:text-gray-400">
                {t.usageCount}×
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
};
