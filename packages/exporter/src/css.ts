import type { ExtractionResult, TokenOverride } from '@extension/extractor';

export const exportAsCss = (result: ExtractionResult, overrides?: TokenOverride[]): string => {
  const overrideMap = new Map<string, string>();
  if (overrides) {
    for (const o of overrides) {
      overrideMap.set(o.tokenId, o.modifiedValue);
    }
  }

  const lines: string[] = [':root {'];

  // Colors
  result.colors.forEach((c, i) => {
    const name = c.cssVariable || `--color-${i + 1}`;
    const tokenId = c.cssVariable || `color-${c.hex.slice(1)}`;
    const value = overrideMap.get(tokenId) ?? c.hex;
    lines.push(`  ${name}: ${value};`);
  });

  // Typography (as comment group)
  if (result.typography.length > 0) {
    lines.push('');
    lines.push('  /* Typography */');
    result.typography.forEach((t, i) => {
      const prefix = `--font-${t.element ? `${t.element}-${i + 1}` : i + 1}`;
      lines.push(`  ${prefix}-family: ${overrideMap.get(`font-family-${i}`) ?? t.fontFamily};`);
      lines.push(`  ${prefix}-size: ${overrideMap.get(`font-size-${i}`) ?? t.fontSize};`);
      lines.push(`  ${prefix}-weight: ${overrideMap.get(`font-weight-${i}`) ?? t.fontWeight};`);
    });
  }

  // Spacing
  if (result.spacing.length > 0) {
    lines.push('');
    lines.push('  /* Spacing */');
    result.spacing.forEach(s => {
      const value = overrideMap.get(`spacing-${s.value}`) ?? s.value;
      lines.push(`  --space-${s.value.replace('px', '')}: ${value};`);
    });
  }

  lines.push('}');
  return lines.join('\n');
};
