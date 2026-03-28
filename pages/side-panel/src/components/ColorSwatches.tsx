import type { ExtractedColor } from '@extension/extractor';

interface Props {
  colors: ExtractedColor[];
  onCopy: (value: string) => void;
}

export const ColorSwatches = ({ colors, onCopy }: Props) => {
  if (colors.length === 0) {
    return (
      <p className="py-2 text-xs" style={{ color: 'var(--text-muted)' }}>
        No colors found.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-4 gap-2">
      {colors.map(color => (
        <button
          key={color.hex}
          type="button"
          onClick={() => onCopy(color.hex)}
          className="group relative flex flex-col items-center gap-1 rounded p-1 transition-colors"
          style={{ ['--hover-bg' as string]: 'var(--bg-hover)' }}
          onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--bg-hover)')}
          onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent')}
          title={`${color.hex} — used ${color.usageCount}x${color.cssVariable ? ` (${color.cssVariable})` : ''}`}>
          <div
            className="h-10 w-10 rounded-lg shadow-sm ring-1 ring-white/10 transition-transform group-hover:scale-110"
            style={{ backgroundColor: color.hex }}
          />
          <span className="font-mono text-[10px] leading-none" style={{ color: 'var(--text-secondary)' }}>
            {color.hex}
          </span>
          {color.cssVariable ? (
            <span className="max-w-[56px] truncate text-[9px] leading-none" style={{ color: 'var(--text-muted)' }}>
              {color.cssVariable}
            </span>
          ) : (
            <span className="text-[9px] leading-none" style={{ color: 'var(--text-muted)' }}>
              {color.usageCount}×
            </span>
          )}
        </button>
      ))}
    </div>
  );
};
