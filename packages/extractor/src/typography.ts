import type { ExtractedTypography } from './types.js';

const TYPOGRAPHY_PROPERTIES = ['font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing'] as const;

/**
 * Scan all descendant elements of `root`, read their inline typography styles,
 * group by the unique combination of the five typography properties, count usage,
 * and track the most common element tag name for each combination.
 *
 * Only inline style declarations are considered to avoid noise from inherited
 * values — matching the same approach used in extractColors.
 */
const extractTypography = (root: Element): ExtractedTypography[] => {
  // Primary map: dedup key → ExtractedTypography result object
  const typographyMap = new Map<string, ExtractedTypography>();
  // Side-car map: dedup key → tag-name frequency counts (not part of output shape)
  const tagCountsMap = new Map<string, Map<string, number>>();

  const elements = root.querySelectorAll('*');

  elements.forEach(el => {
    const inlineStyles = (el as HTMLElement).style;

    // Only consider elements that have at least one typography property declared
    // inline — prevents counting inherited styles from ancestors.
    const hasAnyTypographyInline = TYPOGRAPHY_PROPERTIES.some(prop => inlineStyles.getPropertyValue(prop) !== '');
    if (!hasAnyTypographyInline) return;

    const computedStyles = getComputedStyle(el);

    const fontFamily = computedStyles.getPropertyValue('font-family');
    const fontSize = computedStyles.getPropertyValue('font-size');
    const fontWeight = computedStyles.getPropertyValue('font-weight');
    const lineHeight = computedStyles.getPropertyValue('line-height');
    const letterSpacing = computedStyles.getPropertyValue('letter-spacing');

    const key = [fontFamily, fontSize, fontWeight, lineHeight, letterSpacing].join('||');

    const tagName = el.tagName.toLowerCase();

    const existing = typographyMap.get(key);
    if (existing) {
      existing.usageCount++;

      const tagCounts = tagCountsMap.get(key)!;
      tagCounts.set(tagName, (tagCounts.get(tagName) ?? 0) + 1);

      // Update element to the most frequently used tag for this combination
      let maxCount = 0;
      let dominantTag: string | undefined;
      tagCounts.forEach((count, tag) => {
        if (count > maxCount) {
          maxCount = count;
          dominantTag = tag;
        }
      });
      existing.element = dominantTag;
    } else {
      typographyMap.set(key, {
        fontFamily,
        fontSize,
        fontWeight,
        lineHeight,
        letterSpacing,
        usageCount: 1,
        element: tagName,
      });
      tagCountsMap.set(key, new Map([[tagName, 1]]));
    }
  });

  return Array.from(typographyMap.values()).sort((a, b) => b.usageCount - a.usageCount);
};

export { extractTypography };
