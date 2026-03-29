import type { ExtractionResult, TokenOverride } from '@extension/extractor';

export const exportAsTailwind = (result: ExtractionResult, overrides?: TokenOverride[]): string => {
  const overrideMap = new Map<string, string>();
  if (overrides) {
    for (const o of overrides) {
      overrideMap.set(o.tokenId, o.modifiedValue);
    }
  }

  const config: Record<string, unknown> = {
    theme: {
      extend: {
        colors: Object.fromEntries(
          result.colors.map((c, i) => {
            const tokenId = c.cssVariable || `color-${c.hex.slice(1)}`;
            const value = overrideMap.get(tokenId) ?? c.hex;
            return [c.cssVariable?.replace('--', '') || `brand-${i + 1}`, value];
          }),
        ),
        spacing: Object.fromEntries(
          result.spacing.map(s => {
            const value = overrideMap.get(`spacing-${s.value}`) ?? s.value;
            return [s.value.replace('px', ''), value];
          }),
        ),
        fontSize: Object.fromEntries(
          result.typography.map((t, i) => {
            const fontSize = overrideMap.get(`font-size-${i}`) ?? t.fontSize;
            const fontWeight = overrideMap.get(`font-weight-${i}`) ?? t.fontWeight;
            return [t.fontSize.replace('px', ''), [fontSize, { lineHeight: t.lineHeight, fontWeight }]];
          }),
        ),
      },
    },
  };

  return `/** @type {import('tailwindcss').Config} */\nmodule.exports = ${JSON.stringify(config, null, 2)};`;
};
