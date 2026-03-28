import { useRef, useState } from 'react';
import type { ExtractedColor, TokenOverride } from '@extension/extractor';

interface Props {
  colors: ExtractedColor[];
  overrides: Map<string, TokenOverride>;
  onOverride: (override: TokenOverride) => void;
  onResetOverride: (tokenId: string) => void;
  onCopy: (value: string) => void;
}

const getTokenId = (color: ExtractedColor): string =>
  color.cssVariable ? color.cssVariable : `color-${color.hex.slice(1)}`;

const ColorEditor = ({ colors, overrides, onOverride, onResetOverride, onCopy }: Props) => {
  const inputRefs = useRef<Map<string, HTMLInputElement>>(new Map());
  const [, forceUpdate] = useState(0);

  if (colors.length === 0) {
    return (
      <p className="py-2 text-xs" style={{ color: 'var(--text-muted)' }}>
        No colors found.
      </p>
    );
  }

  const handleSwatchClick = (color: ExtractedColor) => {
    const tokenId = getTokenId(color);
    const input = inputRefs.current.get(tokenId);
    if (input) {
      input.click();
    }
  };

  const handleColorChange = (color: ExtractedColor, newHex: string) => {
    const tokenId = getTokenId(color);
    const override: TokenOverride = {
      tokenId,
      originalValue: color.hex,
      modifiedValue: newHex,
      type: color.cssVariable ? 'cssVariable' : 'computed',
      selectors: color.cssVariable ? undefined : color.selectors,
    };
    onOverride(override);
    forceUpdate(n => n + 1);
  };

  return (
    <div className="grid grid-cols-4 gap-2">
      {colors.map(color => {
        const tokenId = getTokenId(color);
        const override = overrides.get(tokenId);
        const displayHex = override ? override.modifiedValue : color.hex;
        const isModified = override !== undefined;

        return (
          <div key={tokenId} className="relative flex flex-col items-center gap-1 rounded p-1">
            {/* Hidden native color picker */}
            <input
              type="color"
              ref={el => {
                if (el) {
                  inputRefs.current.set(tokenId, el);
                } else {
                  inputRefs.current.delete(tokenId);
                }
              }}
              value={displayHex.startsWith('#') ? displayHex : color.hex}
              onChange={e => handleColorChange(color, e.target.value)}
              className="sr-only absolute"
              tabIndex={-1}
              aria-hidden="true"
            />

            {/* Swatch button — click to open color picker */}
            <button
              type="button"
              onClick={() => handleSwatchClick(color)}
              onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--bg-hover)')}
              onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent')}
              className="group relative flex flex-col items-center gap-1 rounded p-1 transition-colors"
              title={`${displayHex} — used ${color.usageCount}x${color.cssVariable ? ` (${color.cssVariable})` : ''} — click to edit`}>
              <div
                className="relative h-10 w-10 rounded-lg shadow-sm ring-1 ring-white/10 transition-transform group-hover:scale-110"
                style={{ backgroundColor: displayHex }}>
                {/* Modified indicator dot */}
                {isModified && (
                  <span
                    className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full ring-2"
                    style={{ backgroundColor: 'var(--accent-primary)', ringColor: 'var(--bg-primary)' }}
                    aria-label="Modified"
                  />
                )}
              </div>
            </button>

            {/* Hex label — click to copy */}
            <button
              type="button"
              onClick={() => onCopy(displayHex)}
              className="font-mono text-[10px] leading-none transition-opacity hover:opacity-70"
              style={{ color: 'var(--text-secondary)' }}
              title={`Copy ${displayHex}`}>
              {displayHex}
            </button>

            {color.cssVariable ? (
              <span className="max-w-[56px] truncate text-[9px] leading-none" style={{ color: 'var(--text-muted)' }}>
                {color.cssVariable}
              </span>
            ) : (
              <span className="text-[9px] leading-none" style={{ color: 'var(--text-muted)' }}>
                {color.usageCount}×
              </span>
            )}

            {/* Reset link */}
            {isModified && (
              <button
                type="button"
                onClick={() => onResetOverride(tokenId)}
                className="text-[9px] leading-none transition-colors"
                style={{ color: 'var(--status-error)' }}
                onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.opacity = '0.8')}
                onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.opacity = '1')}
                title={`Reset to ${color.hex}`}>
                Reset
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
};

export { ColorEditor };
