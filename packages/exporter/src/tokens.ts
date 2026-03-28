import type { ExtractionResult } from '@extension/extractor';

export const exportAsTokens = (result: ExtractionResult): string =>
  JSON.stringify(
    {
      colors: Object.fromEntries(
        result.colors.map(c => [c.cssVariable || `color-${c.hex.slice(1)}`, { value: c.hex, type: 'color' }]),
      ),
      typography: Object.fromEntries(
        result.typography.map((t, i) => [
          `type-${t.element ? `${t.element}-${i}` : i}`,
          {
            fontFamily: { value: t.fontFamily, type: 'fontFamily' },
            fontSize: { value: t.fontSize, type: 'fontSize' },
            fontWeight: { value: t.fontWeight, type: 'fontWeight' },
            lineHeight: { value: t.lineHeight, type: 'lineHeight' },
          },
        ]),
      ),
      spacing: Object.fromEntries(
        result.spacing.map(s => [`space-${s.value.replace('px', '')}`, { value: s.value, type: 'spacing' }]),
      ),
    },
    null,
    2,
  );
