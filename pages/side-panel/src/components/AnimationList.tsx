import type { ExtractedAnimation } from '@extension/extractor';

interface Props {
  animations: ExtractedAnimation[];
  onCopy: (value: string) => void;
}

/**
 * Parse a CSS time value (e.g. "0.3s", "300ms") to milliseconds.
 * Returns 0 for unrecognised values.
 */
const toMs = (value: string): number => {
  const n = parseFloat(value);
  if (isNaN(n)) return 0;
  return value.endsWith('ms') ? n : n * 1000;
};

const MAX_BAR_WIDTH = 80; // px — visual cap for the duration bar
const MAX_REFERENCE_MS = 1000; // 1 s maps to full bar width

const buildCssValue = (a: ExtractedAnimation): string => {
  const parts = [a.property, a.duration, a.timingFunction];
  if (a.delay !== '0s' && a.delay !== '0ms') parts.push(a.delay);
  return `transition: ${parts.join(' ')};`;
};

export const AnimationList = ({ animations, onCopy }: Props) => {
  if (animations.length === 0) {
    return (
      <p className="py-2 text-xs" style={{ color: 'var(--text-muted)' }}>
        No animations or transitions found.
      </p>
    );
  }

  const maxMs = Math.max(...animations.map(a => toMs(a.duration)), MAX_REFERENCE_MS);

  return (
    <div className="flex flex-col">
      {animations.map((anim, index) => {
        const durationMs = toMs(anim.duration);
        const barWidth = Math.max(4, Math.round((durationMs / maxMs) * MAX_BAR_WIDTH));
        const hasDelay = anim.delay !== '0s' && anim.delay !== '0ms';

        return (
          <button
            key={index}
            type="button"
            onClick={() => onCopy(buildCssValue(anim))}
            className="group flex items-center gap-3 rounded px-1 py-2 text-left transition-colors"
            onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--bg-secondary)')}
            onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent')}
            style={{ borderBottom: '1px solid var(--border-subtle)' }}
            title={`${anim.property} ${anim.duration} ${anim.timingFunction}${hasDelay ? ` delay ${anim.delay}` : ''} — used ${anim.usageCount}x`}>
            {/* Timeline bar */}
            <span className="flex shrink-0 items-center" style={{ width: MAX_BAR_WIDTH }}>
              <span
                className="block rounded-sm transition-all"
                style={{
                  width: barWidth,
                  height: 8,
                  backgroundColor: 'var(--accent-primary)',
                  opacity: 0.7,
                }}
                aria-hidden="true"
              />
            </span>

            {/* Details */}
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate font-mono text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                {anim.property}
              </span>
              <span className="font-mono text-[10px]" style={{ color: 'var(--text-muted)' }}>
                {anim.duration}
                {hasDelay && <span style={{ color: 'var(--text-muted)' }}> +{anim.delay}</span>}{' '}
                <span style={{ color: 'var(--text-muted)' }}>{anim.timingFunction}</span>
              </span>
            </span>

            {/* Usage count */}
            <span className="shrink-0 text-[9px]" style={{ color: 'var(--text-muted)' }}>
              {anim.usageCount}×
            </span>
          </button>
        );
      })}
    </div>
  );
};
