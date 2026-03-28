import type { ExtractedColor } from '@extension/extractor';

interface Props {
  colors: ExtractedColor[];
  onCopy: (value: string) => void;
}

export const ColorSwatches = ({ colors, onCopy }: Props) => {
  if (colors.length === 0) {
    return <p className="py-2 text-xs text-gray-400">No colors found.</p>;
  }

  return (
    <div className="grid grid-cols-4 gap-2">
      {colors.map(color => (
        <button
          key={color.hex}
          type="button"
          onClick={() => onCopy(color.hex)}
          className="group relative flex flex-col items-center gap-1 rounded p-1 transition-colors hover:bg-gray-100"
          title={`${color.hex} — used ${color.usageCount}x${color.cssVariable ? ` (${color.cssVariable})` : ''}`}>
          <div
            className="h-10 w-10 rounded-lg shadow-sm ring-1 ring-black/10 transition-transform group-hover:scale-110"
            style={{ backgroundColor: color.hex }}
          />
          <span className="font-mono text-[10px] leading-none text-gray-600">{color.hex}</span>
          {color.cssVariable ? (
            <span className="max-w-[56px] truncate text-[9px] leading-none text-gray-400">{color.cssVariable}</span>
          ) : (
            <span className="text-[9px] leading-none text-gray-300">{color.usageCount}×</span>
          )}
        </button>
      ))}
    </div>
  );
};
