/**
 * Determines whether a CSS property is directly applied to an element
 * (via inline style or a stylesheet rule targeting it) versus merely
 * inherited from an ancestor.
 *
 * Note: jsdom does not fully simulate CSS inheritance through
 * getComputedStyle, so the computed-value comparison is a best-effort
 * heuristic. In a real browser it accurately catches stylesheet rules.
 */

/**
 * Returns true if the element has the given CSS property applied directly
 * rather than inherited:
 *  1. The property is set in the element's inline `style` attribute → true
 *  2. The element has no parent element (is the root) → true
 *  3. The element's computed value differs from its parent's computed value → true
 *  4. Otherwise → false (value is inherited)
 */
const hasDirectStyle = (el: Element, property: string): boolean => {
  // 1. Inline style check — fastest and most reliable path
  const inlineValue = (el as HTMLElement).style?.getPropertyValue(property);
  if (inlineValue !== '' && inlineValue !== undefined) {
    return true;
  }

  // 2. Root element — no parent to inherit from
  const parent = el.parentElement;
  if (parent === null) {
    return true;
  }

  // 3. Compare computed values between element and its parent
  const elComputed = getComputedStyle(el).getPropertyValue(property);
  const parentComputed = getComputedStyle(parent).getPropertyValue(property);

  return elComputed !== parentComputed;
};

/**
 * Returns true if the element has ANY of the given CSS properties applied
 * directly (not inherited).
 */
const hasAnyDirectStyle = (el: Element, properties: readonly string[]): boolean =>
  properties.some(prop => hasDirectStyle(el, prop));

/**
 * Build a CSS selector string for an element that is as specific as possible
 * without resorting to DOM mutation (data attributes).
 *
 * Priority (descending):
 *  1. `tag#id`                    — when the element has an id attribute
 *  2. `tag.class1.class2.class3`  — all classes for maximum specificity
 *  3. `tag[role="..."]`           — when the element has a role attribute
 *  4. `tag[type="..."]`           — when the element has a type attribute
 *  5. `parent > tag:nth-of-type(n)` — positional selector as fallback
 */
const buildSelector = (el: Element): string => {
  const tag = el.tagName.toLowerCase();

  const id = el.getAttribute('id');
  if (id) {
    return `${tag}#${CSS.escape(id)}`;
  }

  const className = el.getAttribute('class');
  if (className) {
    const classes = className
      .trim()
      .split(/\s+/)
      .filter(c => c.length > 0);
    if (classes.length > 0) {
      return `${tag}.${classes.map(c => CSS.escape(c)).join('.')}`;
    }
  }

  const role = el.getAttribute('role');
  if (role) {
    return `${tag}[role="${role}"]`;
  }

  const type = el.getAttribute('type');
  if (type) {
    return `${tag}[type="${type}"]`;
  }

  // Positional fallback: use nth-of-type relative to parent
  const parent = el.parentElement;
  if (parent) {
    const siblings = Array.from(parent.children).filter(c => c.tagName === el.tagName);
    if (siblings.length > 1) {
      const idx = siblings.indexOf(el) + 1;
      const parentSel = buildSelector(parent);
      return `${parentSel} > ${tag}:nth-of-type(${idx})`;
    }
  }

  return tag;
};

export { buildSelector, hasAnyDirectStyle, hasDirectStyle };
