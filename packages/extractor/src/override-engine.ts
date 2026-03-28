import type { TokenOverride } from './types.js';

const STYLE_ELEMENT_ID = 'branding-extractor-overrides';

/**
 * Known CSS property prefixes used to infer the property name from a computed
 * tokenId. Ordered longest-first so that `background-color` is matched before
 * `color` when both are valid prefixes.
 */
const KNOWN_PROPERTIES = [
  'background-color',
  'border-color',
  'font-family',
  'font-size',
  'font-weight',
  'letter-spacing',
  'line-height',
  'letter-spacing',
  'padding',
  'margin',
  'color',
  'gap',
] as const;

/**
 * Infer the CSS property name from a computed tokenId.
 *
 * Token IDs for computed values follow the pattern `<property>-<value>`, e.g.:
 *   `color-#3b82f6`        → `color`
 *   `font-family-Inter`    → `font-family`
 *   `background-color-#000`→ `background-color`
 *
 * Returns `null` when no known property prefix matches.
 */
const inferProperty = (tokenId: string): string | null => {
  for (const prop of KNOWN_PROPERTIES) {
    if (tokenId.startsWith(`${prop}-`)) {
      return prop;
    }
  }
  return null;
};

/**
 * OverrideEngine manages a single injected `<style>` element that holds live
 * design token overrides. Call `applyOverride` to add or update an entry, and
 * the stylesheet is rebuilt immediately from the in-memory map.
 */
class OverrideEngine {
  private readonly doc: Document;
  private readonly styleEl: HTMLStyleElement;
  private readonly overrides: Map<string, TokenOverride> = new Map();

  constructor(doc: Document) {
    this.doc = doc;

    // Remove any pre-existing element with the same id to avoid duplicates.
    const existing = doc.getElementById(STYLE_ELEMENT_ID);
    if (existing !== null) {
      existing.remove();
    }

    const el = doc.createElement('style');
    el.id = STYLE_ELEMENT_ID;
    doc.head.appendChild(el);
    this.styleEl = el;
  }

  applyOverride(override: TokenOverride): void {
    this.overrides.set(override.tokenId, override);
    this.rebuild();
  }

  removeOverride(tokenId: string): void {
    this.overrides.delete(tokenId);
    this.rebuild();
  }

  clearAll(): void {
    this.overrides.clear();
    this.rebuild();
  }

  setEnabled(enabled: boolean): void {
    this.styleEl.disabled = !enabled;
  }

  getOverrides(): TokenOverride[] {
    return Array.from(this.overrides.values());
  }

  destroy(): void {
    this.styleEl.remove();
  }

  private rebuild(): void {
    const parts: string[] = [];

    for (const override of this.overrides.values()) {
      if (override.type === 'cssVariable') {
        parts.push(`:root { ${override.tokenId}: ${override.modifiedValue} !important; }`);
      } else {
        // computed type — needs selectors and an inferred property
        const selectors = override.selectors;
        if (selectors === undefined || selectors.length === 0) {
          continue;
        }
        const property = inferProperty(override.tokenId);
        if (property === null) {
          continue;
        }
        const selectorList = selectors.join(', ');
        parts.push(`${selectorList} { ${property}: ${override.modifiedValue} !important; }`);
      }
    }

    this.styleEl.textContent = parts.join('\n');
  }
}

export { OverrideEngine };
