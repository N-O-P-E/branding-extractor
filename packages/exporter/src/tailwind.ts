import type { ExtractionResult } from '@extension/extractor';

export const exportAsTailwind = (result: ExtractionResult): string => {
  const config: Record<string, unknown> = {
    theme: {
      extend: {
        colors: Object.fromEntries(
          result.colors.map((c, i) => [c.cssVariable?.replace('--', '') || `brand-${i + 1}`, c.hex]),
        ),
        spacing: Object.fromEntries(result.spacing.map(s => [s.value.replace('px', ''), s.value])),
        fontSize: Object.fromEntries(
          result.typography.map(t => [
            t.fontSize.replace('px', ''),
            [t.fontSize, { lineHeight: t.lineHeight, fontWeight: t.fontWeight }],
          ]),
        ),
      },
    },
  };

  return `/** @type {import('tailwindcss').Config} */\nmodule.exports = ${JSON.stringify(config, null, 2)};`;
};
