import type { ExtractionResult, TokenOverride } from '@extension/extractor';

export const exportAsTokens = (result: ExtractionResult, overrides?: TokenOverride[]): string => {
  const overrideMap = new Map<string, string>();
  if (overrides) {
    for (const o of overrides) {
      overrideMap.set(o.tokenId, o.modifiedValue);
    }
  }

  const getColorValue = (c: { hex: string; cssVariable?: string }): string => {
    const tokenId = c.cssVariable || `color-${c.hex.slice(1)}`;
    return overrideMap.get(tokenId) ?? c.hex;
  };

  return JSON.stringify(
    {
      colors: Object.fromEntries(
        result.colors.map(c => [
          c.cssVariable || `color-${c.hex.slice(1)}`,
          { value: getColorValue(c), type: 'color' },
        ]),
      ),
      typography: Object.fromEntries(
        result.typography.map((t, i) => {
          const prefix = `type-${t.element ? `${t.element}-${i}` : i}`;
          return [
            prefix,
            {
              fontFamily: {
                value: overrideMap.get(`font-family-${i}`) ?? t.fontFamily,
                type: 'fontFamily',
              },
              fontSize: {
                value: overrideMap.get(`font-size-${i}`) ?? t.fontSize,
                type: 'fontSize',
              },
              fontWeight: {
                value: overrideMap.get(`font-weight-${i}`) ?? t.fontWeight,
                type: 'fontWeight',
              },
              lineHeight: { value: t.lineHeight, type: 'lineHeight' },
            },
          ];
        }),
      ),
      spacing: Object.fromEntries(
        result.spacing.map(s => [
          `space-${s.value.replace('px', '')}`,
          {
            value: overrideMap.get(`spacing-${s.value}`) ?? s.value,
            type: 'spacing',
          },
        ]),
      ),
    },
    null,
    2,
  );
};
