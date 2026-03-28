import type { ExtractionResult } from '@extension/extractor';

export const exportAsCss = (result: ExtractionResult): string => {
  const lines: string[] = [':root {'];

  // Colors
  result.colors.forEach((c, i) => {
    const name = c.cssVariable || `--color-${i + 1}`;
    lines.push(`  ${name}: ${c.hex};`);
  });

  // Typography (as comment group)
  if (result.typography.length > 0) {
    lines.push('');
    lines.push('  /* Typography */');
    result.typography.forEach((t, i) => {
      const prefix = `--font-${t.element || i + 1}`;
      lines.push(`  ${prefix}-family: ${t.fontFamily};`);
      lines.push(`  ${prefix}-size: ${t.fontSize};`);
      lines.push(`  ${prefix}-weight: ${t.fontWeight};`);
    });
  }

  // Spacing
  if (result.spacing.length > 0) {
    lines.push('');
    lines.push('  /* Spacing */');
    result.spacing.forEach(s => {
      lines.push(`  --space-${s.value.replace('px', '')}: ${s.value};`);
    });
  }

  lines.push('}');
  return lines.join('\n');
};
