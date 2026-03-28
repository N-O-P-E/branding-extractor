import type { ExtractedComponent } from '@extension/extractor';

interface Props {
  components: ExtractedComponent[];
  onCopy: (value: string) => void;
}

/** Serialize a styles object into a CSS declaration block string. */
const stylesToCss = (selector: string, styles: Record<string, string>): string => {
  const decls = Object.entries(styles)
    .map(([prop, val]) => `  ${prop}: ${val};`)
    .join('\n');
  return `${selector} {\n${decls}\n}`;
};

/** A small ordered list of "interesting" style properties to surface in the summary. */
const HIGHLIGHT_PROPS = [
  'background-color',
  'color',
  'border-radius',
  'padding',
  'font-size',
  'font-weight',
  'border',
  'box-shadow',
];

const getHighlightedStyles = (styles: Record<string, string>): Array<[string, string]> => {
  const result: Array<[string, string]> = [];
  for (const prop of HIGHLIGHT_PROPS) {
    if (styles[prop]) {
      result.push([prop, styles[prop]]);
    }
    if (result.length >= 3) break;
  }
  return result;
};

export const ComponentList = ({ components, onCopy }: Props) => {
  if (components.length === 0) {
    return <p className="py-2 text-xs text-gray-400">No components found.</p>;
  }

  // Group components by type
  const grouped = components.reduce<Record<string, ExtractedComponent[]>>((acc, comp) => {
    const key = comp.type || 'other';
    (acc[key] ??= []).push(comp);
    return acc;
  }, {});

  return (
    <div className="flex flex-col gap-3">
      {Object.entries(grouped).map(([type, items]) => (
        <div key={type}>
          {/* Group header */}
          <div className="mb-1 flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{type}</span>
            <span className="text-[10px] text-gray-300">{items.length}</span>
          </div>

          <div className="flex flex-col divide-y divide-gray-100">
            {items.map((comp, index) => {
              const css = stylesToCss(comp.selector, comp.styles);
              const highlights = getHighlightedStyles(comp.styles);

              return (
                <button
                  key={index}
                  type="button"
                  onClick={() => onCopy(css)}
                  className="group flex flex-col gap-1 rounded px-1 py-2 text-left transition-colors hover:bg-gray-50"
                  title="Click to copy CSS">
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-gray-700">{comp.selector}</span>
                    <span className="shrink-0 text-[9px] text-gray-300 transition-colors group-hover:text-gray-400">
                      {comp.count}×
                    </span>
                  </div>

                  {highlights.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {highlights.map(([prop, val]) => (
                        <span
                          key={prop}
                          className="max-w-[120px] truncate rounded bg-gray-100 px-1 py-0.5 font-mono text-[9px] text-gray-500"
                          title={`${prop}: ${val}`}>
                          {val}
                        </span>
                      ))}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};
