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
    return (
      <p className="py-2 text-xs" style={{ color: 'var(--text-muted)' }}>
        No typography styles found.
      </p>
    );
  }

  return (
    <div className="flex flex-col" style={{ borderColor: 'var(--border-subtle)' }}>
      {typography.map((t, index) => {
        const css = buildCssString(t);
        const label = t.element ? `<${t.element}>` : null;

        return (
          <button
            key={index}
            type="button"
            onClick={() => onCopy(css)}
            className="group flex items-center gap-3 rounded px-1 py-2 text-left transition-colors"
            onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--bg-secondary)')}
            onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent')}
            style={{ borderBottom: '1px solid var(--border-subtle)' }}
            title="Click to copy CSS">
            {/* Preview text rendered in the actual style */}
            <span
              className="shrink-0 leading-none"
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
                color: 'var(--text-primary)',
              }}
              aria-hidden="true">
              Aa
            </span>

            {/* Details */}
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate font-mono text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                {t.fontFamily.split(',')[0].replace(/['"]/g, '').trim()}
              </span>
              <span className="font-mono text-[10px]" style={{ color: 'var(--text-muted)' }}>
                {t.fontSize} / {t.fontWeight} / lh {t.lineHeight}
              </span>
            </span>

            {/* Right-side badges */}
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
            </span>
          </button>
        );
      })}
    </div>
  );
};
