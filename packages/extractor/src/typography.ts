import { buildSelector, hasAnyDirectStyle } from './parent-diff.js';
import type { ExtractedTypography } from './types.js';

const TYPOGRAPHY_PROPERTIES = ['font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing'] as const;

/**
 * Scan all descendant elements of `root`, read their inline typography styles,
 * group by the unique combination of the five typography properties, count usage,
 * and track the most common element tag name for each combination.
 *
 * Only properties directly applied to the element (inline or via stylesheet rule)
 * are considered — inherited values from ancestors are filtered out using
 * parent-diff to avoid noise.
 */
const extractTypography = (root: Element): ExtractedTypography[] => {
  // Primary map: dedup key → ExtractedTypography result object
  const typographyMap = new Map<string, ExtractedTypography>();
  // Side-car map: dedup key → tag-name frequency counts (not part of output shape)
  const tagCountsMap = new Map<string, Map<string, number>>();

  const elements = root.querySelectorAll('*');

  elements.forEach(el => {
    // Only consider elements that have at least one typography property applied
    // directly — prevents counting inherited styles from ancestors.
    if (!hasAnyDirectStyle(el, TYPOGRAPHY_PROPERTIES)) return;

    const computedStyles = getComputedStyle(el);

    const fontFamily = computedStyles.getPropertyValue('font-family');
    const fontSize = computedStyles.getPropertyValue('font-size');
    const fontWeight = computedStyles.getPropertyValue('font-weight');
    const lineHeight = computedStyles.getPropertyValue('line-height');
    const letterSpacing = computedStyles.getPropertyValue('letter-spacing');

    const key = [fontFamily, fontSize, fontWeight, lineHeight, letterSpacing].join('||');

    const tagName = el.tagName.toLowerCase();
    const sel = buildSelector(el);

    const existing = typographyMap.get(key);
    if (existing) {
      existing.usageCount++;

      if (!existing.selectors.includes(sel)) {
        existing.selectors.push(sel);
      }

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
        selectors: [sel],
        element: tagName,
      });
      tagCountsMap.set(key, new Map([[tagName, 1]]));
    }
  });

  return Array.from(typographyMap.values()).sort((a, b) => b.usageCount - a.usageCount);
};

export { extractTypography };
