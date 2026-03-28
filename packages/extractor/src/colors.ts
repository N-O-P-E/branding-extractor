import { buildSelector, hasDirectStyle } from './parent-diff.js';
import { scanStylesheets } from './stylesheet-scanner.js';
import type { ExtractedColor } from './types.js';

// Matches var(--name) or var(--name, fallback) — captures the variable name only.
const CSS_VAR_USAGE_RE = /var\(\s*(-{2}[\w-]+)/;

const COLOR_PROPERTIES = [
  'color',
  'background-color',
  'border-color',
  'outline-color',
  'text-decoration-color',
  'border-top-color',
  'border-right-color',
  'border-bottom-color',
  'border-left-color',
];

const isTransparent = (value: string): boolean => {
  // Handle transparent keyword
  if (value === 'transparent') return true;

  // Handle rgba(0, 0, 0, 0) with or without spaces
  const rgbaMatch = value.match(/rgba\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)/);
  if (rgbaMatch) {
    const [, , , , a] = rgbaMatch;
    // Any color with alpha === 0 is fully transparent regardless of RGB values
    return parseFloat(a) === 0;
  }

  return false;
};

const rgbToHex = (rgb: string): string | null => {
  // Extract rgba values with flexible spacing
  const match = rgb.match(/rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)/);
  if (!match) return null;

  const r = Number(match[1]);
  const g = Number(match[2]);
  const b = Number(match[3]);
  const alpha = match[4] ? parseFloat(match[4]) : 1;

  // Skip colors with partial transparency (alpha < 1)
  // We can't represent alpha in 6-digit hex, so skip these colors
  if (alpha < 1) return null;

  return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
};

const hexToRgb = (hex: string): { r: number; g: number; b: number } => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : { r: 0, g: 0, b: 0 };
};

const hexToHsl = (hex: string): { h: number; s: number; l: number } => {
  const { r, g, b } = hexToRgb(hex);
  const rNorm = r / 255,
    gNorm = g / 255,
    bNorm = b / 255;
  const max = Math.max(rNorm, gNorm, bNorm);
  const min = Math.min(rNorm, gNorm, bNorm);
  let h = 0,
    s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rNorm:
        h = ((gNorm - bNorm) / d + (gNorm < bNorm ? 6 : 0)) / 6;
        break;
      case gNorm:
        h = ((bNorm - rNorm) / d + 2) / 6;
        break;
      case bNorm:
        h = ((rNorm - gNorm) / d + 4) / 6;
        break;
    }
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
};

const extractColors = (root: Element): ExtractedColor[] => {
  const colorMap = new Map<string, ExtractedColor>();
  // Track which elements have already contributed to each hex's usageCount so
  // that multiple properties on the same element (e.g. color + border-color
  // both resolving to currentColor) count as a single usage.
  const seenElementsForHex = new Map<string, Set<Element>>();
  const doc = root.ownerDocument ?? document;

  // Scan all stylesheets and <style> elements once to build CSS variable maps.
  // colorVarMap: variable name → resolved hex
  // hexToVarName: hex → first variable name that declared it (inverse lookup)
  const { colorVarMap, hexToVarName } = scanStylesheets(doc);

  const elements = root.querySelectorAll('*');

  elements.forEach(el => {
    const inlineStyles = (el as HTMLElement).style;
    const computedStyles = getComputedStyle(el);

    COLOR_PROPERTIES.forEach(prop => {
      // Only process properties directly applied to this element (inline or via
      // stylesheet rule), filtering out values that are merely inherited.
      if (!hasDirectStyle(el, prop)) return;

      const inlineValue = inlineStyles.getPropertyValue(prop);

      // Detect whether the inline declaration references a CSS variable.
      const varMatch = inlineValue ? CSS_VAR_USAGE_RE.exec(inlineValue) : null;
      const declaredVarName = varMatch ? varMatch[1] : undefined;

      // Determine the resolved hex color.
      // - Inline var() reference: resolve via colorVarMap (jsdom won't resolve var())
      // - Inline literal or stylesheet rule: read from computedStyles
      let hex: string | null = null;
      if (declaredVarName) {
        hex = colorVarMap.get(declaredVarName) ?? null;
      } else {
        const computed = computedStyles.getPropertyValue(prop);
        if (computed && !isTransparent(computed)) {
          hex = rgbToHex(computed);
        }
      }

      if (!hex) return;

      // Determine which CSS variable name to associate. Prefer the one explicitly
      // written in the declaration; fall back to the inverse lookup for cases where
      // the browser (or a real env) has already resolved the value.
      const cssVariable = declaredVarName ?? hexToVarName.get(hex);

      const sel = buildSelector(el);
      const existing = colorMap.get(hex);

      // usageCount tracks unique elements, not property-element combinations.
      // CSS currentColor can cause multiple properties on the same element to
      // resolve to the same hex — we count the element only once.
      let seenEls = seenElementsForHex.get(hex);
      if (!seenEls) {
        seenEls = new Set<Element>();
        seenElementsForHex.set(hex, seenEls);
      }
      const isNewElement = !seenEls.has(el);
      seenEls.add(el);

      if (existing) {
        if (isNewElement) {
          existing.usageCount++;
        }
        if (!existing.properties.includes(prop)) {
          existing.properties.push(prop);
        }
        if (!existing.selectors.includes(sel)) {
          existing.selectors.push(sel);
        }
        // Attach variable name if not yet set
        if (!existing.cssVariable && cssVariable) {
          existing.cssVariable = cssVariable;
        }
      } else {
        colorMap.set(hex, {
          hex,
          rgb: hexToRgb(hex),
          hsl: hexToHsl(hex),
          usageCount: 1,
          properties: [prop],
          selectors: [sel],
          ...(cssVariable ? { cssVariable } : {}),
        });
      }
    });
  });

  return Array.from(colorMap.values()).sort((a, b) => b.usageCount - a.usageCount);
};

export { extractColors };
