import type { ExtractedComponent } from './types.js';

/**
 * CSS properties captured for every detected component regardless of type.
 * These are read from the element's inline style (falling back to computed style
 * when the inline value is empty) so that the extracted styles reflect what is
 * intentionally declared on the component rather than inherited values.
 */
const COMPONENT_STYLE_PROPERTIES = [
  'background-color',
  'border-radius',
  'border',
  'border-color',
  'border-width',
  'box-shadow',
  'color',
  'font-size',
  'font-weight',
  'padding',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
] as const;

/**
 * Read the relevant styles for a component from the element.
 * Only properties that are explicitly set in the inline style are included —
 * this avoids polluting results with browser-default or inherited values.
 * When getComputedStyle returns the canonical representation (e.g. expanded
 * padding longhands), we use that so the values are always normalised.
 */
const extractElementStyles = (el: HTMLElement): Record<string, string> => {
  const inlineStyles = el.style;
  const computedStyles = getComputedStyle(el);
  const styles: Record<string, string> = {};

  for (const prop of COMPONENT_STYLE_PROPERTIES) {
    const inlineValue = inlineStyles.getPropertyValue(prop);
    if (!inlineValue) continue;

    // Prefer the computed value (already normalised by the browser / jsdom)
    // but fall back to the authored inline value if computed is unavailable.
    const computed = computedStyles.getPropertyValue(prop);
    const value = computed || inlineValue;
    if (value) {
      styles[prop] = value;
    }
  }

  // box-shadow is not in the inline-only check list above because it is not a
  // shorthand that gets expanded — we need to check it separately for card
  // detection. Add it when explicitly authored inline.
  const inlineShadow = inlineStyles.getPropertyValue('box-shadow');
  if (inlineShadow) {
    const computedShadow = computedStyles.getPropertyValue('box-shadow');
    styles['box-shadow'] = computedShadow || inlineShadow;
  }

  return styles;
};

/**
 * Build a simple CSS selector string for the element.
 * We use the tag name plus the first class name when one is present.
 * This is deliberately lightweight — it is a display hint, not a guaranteed
 * unique selector.
 */
const buildSelector = (el: Element): string => {
  const tag = el.tagName.toLowerCase();
  const firstClass = el.classList[0];
  if (firstClass) return `${tag}.${firstClass}`;

  const role = el.getAttribute('role');
  if (role) return `${tag}[role="${role}"]`;

  const type = el.getAttribute('type');
  if (type) return `${tag}[type="${type}"]`;

  const contenteditable = el.getAttribute('contenteditable');
  if (contenteditable !== null) return `${tag}[contenteditable]`;

  return tag;
};

/**
 * Derive a stable grouping key from a component candidate so that elements
 * that share the same type and visual signature are merged into one entry with
 * an incremented count.
 *
 * The key intentionally ignores properties that vary between otherwise
 * equivalent instances (e.g. the exact padding value of two inputs with the
 * same structure) — we only include properties that strongly characterise the
 * component pattern.
 */
const buildGroupKey = (type: string, el: HTMLElement): string => {
  const styles = el.style;
  const computed = getComputedStyle(el);
  const tag = el.tagName.toLowerCase();

  const get = (prop: string): string => {
    const inline = styles.getPropertyValue(prop);
    if (!inline) return '';
    return computed.getPropertyValue(prop) || inline;
  };

  switch (type) {
    case 'button': {
      // Group by tag + background colour + border-radius
      const bg = get('background-color');
      const radius = get('border-radius');
      return `button|${tag}|${bg}|${radius}`;
    }
    case 'input': {
      // Group by tag + border style
      const border = get('border');
      return `input|${tag}|${border}`;
    }
    case 'card': {
      // Group by background-color + border-radius + box-shadow presence
      const bg = get('background-color');
      const radius = get('border-radius');
      const shadow = styles.getPropertyValue('box-shadow') ? 'shadow' : 'no-shadow';
      return `card|${tag}|${bg}|${radius}|${shadow}`;
    }
    default:
      return `${type}|${tag}`;
  }
};

/**
 * Return true when the element carries enough inline-style signals to be
 * classified as a button-like anchor or generic element.
 *
 * Heuristic: an <a> or arbitrary element is considered button-like when it has
 * all three of: a non-trivial background colour, a border-radius, and padding.
 */
const hasButtonLikeStyles = (el: HTMLElement): boolean => {
  const styles = el.style;
  const hasBg = !!styles.getPropertyValue('background-color');
  const hasRadius = !!styles.getPropertyValue('border-radius');
  const hasPadding =
    !!styles.getPropertyValue('padding') ||
    !!styles.getPropertyValue('padding-top') ||
    !!styles.getPropertyValue('padding-left');
  return hasBg && hasRadius && hasPadding;
};

/**
 * Classify a single element as a component type, or return null when it does
 * not match any known pattern.
 *
 * Priority order: button > input > card.
 * An element can only be classified as one type.
 */
const classifyElement = (el: Element): string | null => {
  const tag = el.tagName.toLowerCase();
  const htmlEl = el as HTMLElement;

  // --- Button detection ---
  if (tag === 'button') return 'button';

  const inputType = el.getAttribute('type');
  if (tag === 'input' && inputType === 'submit') return 'button';
  if (tag === 'input' && inputType === 'button') return 'button';
  if (tag === 'input' && inputType === 'reset') return 'button';

  const role = el.getAttribute('role');
  if (role === 'button') return 'button';

  if (tag === 'a' && hasButtonLikeStyles(htmlEl)) return 'button';

  // --- Input detection ---
  if (tag === 'input') return 'input';
  if (tag === 'textarea') return 'input';
  if (tag === 'select') return 'input';

  const contenteditable = el.getAttribute('contenteditable');
  if (contenteditable !== null && contenteditable !== 'false') return 'input';

  // --- Card detection ---
  // A card needs at least 2 of the 3 visual traits: box-shadow, border-radius,
  // padding — combined with being a block-level container (div, section, article, li, …).
  const CARD_CONTAINERS = new Set(['div', 'section', 'article', 'li', 'aside', 'main', 'header', 'footer']);
  if (CARD_CONTAINERS.has(tag)) {
    const inlineStyles = htmlEl.style;
    const hasShadow = !!inlineStyles.getPropertyValue('box-shadow');
    const hasRadius = !!inlineStyles.getPropertyValue('border-radius');
    const hasPadding =
      !!inlineStyles.getPropertyValue('padding') ||
      !!inlineStyles.getPropertyValue('padding-top') ||
      !!inlineStyles.getPropertyValue('padding-left');

    const traitCount = [hasShadow, hasRadius, hasPadding].filter(Boolean).length;
    if (traitCount >= 2) return 'card';
  }

  return null;
};

/**
 * Scan all descendants of `root`, classify recognisable UI components
 * (buttons, inputs, cards), group similar ones, and return an array of
 * `ExtractedComponent` entries sorted by count descending.
 *
 * Only inline style declarations are considered when evaluating style-based
 * heuristics. This keeps the detection consistent with the rest of the
 * extractor suite and avoids false positives caused by inherited or
 * stylesheet-defined styles.
 */
const detectComponents = (root: Element): ExtractedComponent[] => {
  // groupKey → { component, firstEl } for accumulation
  const groupMap = new Map<string, { component: ExtractedComponent; firstSelector: string }>();

  const elements = root.querySelectorAll('*');

  elements.forEach(el => {
    const type = classifyElement(el);
    if (!type) return;

    const htmlEl = el as HTMLElement;
    const key = buildGroupKey(type, htmlEl);
    const selector = buildSelector(el);

    const existing = groupMap.get(key);
    if (existing) {
      existing.component.count++;
    } else {
      groupMap.set(key, {
        component: {
          type,
          selector,
          styles: extractElementStyles(htmlEl),
          count: 1,
        },
        firstSelector: selector,
      });
    }
  });

  return Array.from(groupMap.values())
    .map(entry => entry.component)
    .sort((a, b) => b.count - a.count);
};

export { detectComponents };
