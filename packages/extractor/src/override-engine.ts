import type { TokenOverride } from './types.js';

const STYLE_ELEMENT_ID = 'branding-extractor-overrides';
const FONTS_LINK_ID = 'branding-extractor-fonts';

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

  /** Load Google Fonts for any font-family overrides. */
  private loadFonts(): void {
    const families: string[] = [];
    for (const override of this.overrides.values()) {
      const prop = inferProperty(override.tokenId);
      if (prop === 'font-family') {
        const name = override.modifiedValue.replace(/['"]/g, '').trim();
        if (name) families.push(name);
      }
    }

    // Remove old link if no fonts needed
    const existing = this.doc.getElementById(FONTS_LINK_ID);
    if (families.length === 0) {
      if (existing) existing.remove();
      return;
    }

    const query = families
      .map(f => `family=${encodeURIComponent(f)}:wght@100;200;300;400;500;600;700;800;900`)
      .join('&');
    const href = `https://fonts.googleapis.com/css2?${query}&display=swap`;

    if (existing instanceof HTMLLinkElement && existing.href === href) return;
    if (existing) existing.remove();

    const link = this.doc.createElement('link');
    link.id = FONTS_LINK_ID;
    link.rel = 'stylesheet';
    link.href = href;
    this.doc.head.appendChild(link);
  }

  private rebuild(): void {
    const globalParts: string[] = [];
    const elementParts: string[] = [];

    // Sort overrides: global (priority 0) first, element-level (priority 1+) last
    const sorted = Array.from(this.overrides.values()).sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));

    for (const override of sorted) {
      if (override.type === 'cssVariable') {
        globalParts.push(`:root { ${override.tokenId}: ${override.modifiedValue} !important; }`);
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
        const isElementLevel = (override.priority ?? 0) > 0;

        if (isElementLevel) {
          // Boost specificity by repeating each selector so element overrides win
          const boosted = selectors
            .map(
              s =>
                // Repeat the selector: "h2.foo" → "h2.foo.foo" won't work for tags,
                // but wrapping in :is() and repeating works universally
                `:is(${s}):is(${s})`,
            )
            .join(', ');
          elementParts.push(`${boosted} { ${property}: ${override.modifiedValue} !important; }`);
        } else {
          globalParts.push(`${selectorList} { ${property}: ${override.modifiedValue} !important; }`);
        }
      }
    }

    // Element-level overrides come after global ones so they also win by source order
    this.styleEl.textContent = [...globalParts, ...elementParts].join('\n');
    this.loadFonts();
  }
}

export { OverrideEngine };
