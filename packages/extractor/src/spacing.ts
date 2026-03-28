import { buildSelector, hasAnyDirectStyle, hasDirectStyle } from './parent-diff.js';
import type { ExtractedSpacing } from './types.js';

/**
 * Shorthand properties and their corresponding computed longhands.
 * When an author writes `padding: 16px`, the browser stores the shorthand in
 * the inline style object but computes it into four longhand values. We detect
 * the shorthand, resolve its longhands from getComputedStyle, and report the
 * shorthand name in the `properties` list.
 */
const SHORTHAND_TO_LONGHANDS: Record<string, readonly string[]> = {
  padding: ['padding-top', 'padding-right', 'padding-bottom', 'padding-left'],
  margin: ['margin-top', 'margin-right', 'margin-bottom', 'margin-left'],
  gap: ['row-gap', 'column-gap'],
};

/**
 * Individual (longhand) spacing properties that may appear directly in an
 * inline style declaration.
 */
const LONGHAND_PROPERTIES = [
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'gap',
  'row-gap',
  'column-gap',
] as const;

/**
 * All spacing properties checked for direct-style detection (shorthands +
 * longhands). Used for the early-exit guard via hasAnyDirectStyle.
 */
const ALL_SPACING_PROPERTIES = ['padding', 'margin', 'gap', ...LONGHAND_PROPERTIES] as const;

/**
 * Normalise a raw CSS value string to a canonical `<n>px` string, or return
 * null when the value is not a resolvable length.
 * getComputedStyle in a browser always returns px, but jsdom may return the
 * authored value verbatim, so we also accept bare numbers.
 */
const normaliseToPx = (raw: string): string | null => {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === 'normal' || trimmed === 'auto') return null;

  if (/^-?[\d.]+px$/.test(trimmed)) return trimmed;

  // Bare number — jsdom sometimes skips the unit for computed lengths
  if (/^-?[\d.]+$/.test(trimmed)) return `${trimmed}px`;

  return null;
};

/**
 * Extract spacing values (padding, margin, gap and their sub-properties) from
 * all descendant elements of `root`.
 *
 * Only properties directly applied to an element (inline or via stylesheet rule)
 * are considered — inherited values from ancestors are filtered out using
 * parent-diff. This matches the approach used by extractColors and
 * extractTypography.
 *
 * usageCount counts the number of *elements* that contribute a given value,
 * so a single element using `padding: 16px` adds 1 to the count for `16px`
 * even though the shorthand expands to four longhands.
 *
 * Zero-pixel values are filtered out. Results are grouped by value and sorted
 * by usage count descending.
 */
const extractSpacing = (root: Element): ExtractedSpacing[] => {
  // value → { usageCount, properties, selectors }
  const spacingMap = new Map<string, ExtractedSpacing>();

  const elements = root.querySelectorAll('*');

  elements.forEach(el => {
    // Short-circuit: skip elements with no directly-applied spacing properties
    if (!hasAnyDirectStyle(el, ALL_SPACING_PROPERTIES)) return;

    const computedStyles = getComputedStyle(el);
    const sel = buildSelector(el);

    // Per-element accumulator: value → Set of property names that produced it.
    // This ensures one element contributes at most 1 to usageCount per value,
    // no matter how many longhands a shorthand expands into.
    const perElement = new Map<string, Set<string>>();

    const collect = (px: string, property: string) => {
      const existing = perElement.get(px);
      if (existing) {
        existing.add(property);
      } else {
        perElement.set(px, new Set([property]));
      }
    };

    // --- Shorthand properties ---
    for (const [shorthand, longhands] of Object.entries(SHORTHAND_TO_LONGHANDS)) {
      if (!hasDirectStyle(el, shorthand)) continue;

      // Collect the unique px values that the shorthand resolves to.
      // Each distinct value is attributed to the shorthand name, not the longhand.
      const seenPx = new Set<string>();
      for (const longhand of longhands) {
        const px = normaliseToPx(computedStyles.getPropertyValue(longhand));
        if (!px || px === '0px' || seenPx.has(px)) continue;
        seenPx.add(px);
        collect(px, shorthand);
      }
    }

    // --- Longhand properties ---
    for (const prop of LONGHAND_PROPERTIES) {
      if (!hasDirectStyle(el, prop)) continue;

      const px = normaliseToPx(computedStyles.getPropertyValue(prop));
      if (!px || px === '0px') continue;

      collect(px, prop);
    }

    // Merge per-element results into the global map, incrementing usageCount
    // once per element per value regardless of how many properties sourced it.
    perElement.forEach((properties, value) => {
      const existing = spacingMap.get(value);
      if (existing) {
        existing.usageCount++;
        properties.forEach(p => {
          if (!existing.properties.includes(p)) {
            existing.properties.push(p);
          }
        });
        if (!existing.selectors.includes(sel)) {
          existing.selectors.push(sel);
        }
      } else {
        spacingMap.set(value, {
          value,
          usageCount: 1,
          properties: Array.from(properties),
          selectors: [sel],
        });
      }
    });
  });

  return Array.from(spacingMap.values()).sort((a, b) => b.usageCount - a.usageCount);
};

export { extractSpacing };
