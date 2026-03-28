import type { ExtractedColor } from './types.js';

// Matches a CSS custom property declaration: --name: value;
// Intentionally kept simple — handles single-line declarations inside :root blocks.
const CSS_VAR_DECL_RE = /(-{2}[\w-]+)\s*:\s*([^;}\n]+)/g;

// Matches var(--name) or var(--name, fallback) — captures the variable name only.
const CSS_VAR_USAGE_RE = /var\(\s*(-{2}[\w-]+)/;

/**
 * Parse <style> elements and the documentElement inline style for CSS custom
 * properties whose values are colors. Returns a Map of variable name → hex.
 *
 * jsdom does not expose StyleSheet rules or resolve var() in computed styles,
 * so we parse raw textContent instead.
 */
const extractCssVariables = (doc: Document): Map<string, string> => {
  const varMap = new Map<string, string>();

  const registerDecl = (name: string, rawValue: string) => {
    const trimmed = rawValue.trim();
    // Accept 3/4/6/8-digit hex literals directly
    const hexMatch = trimmed.match(/^#([0-9a-fA-F]{3,8})$/);
    if (hexMatch) {
      // Normalise shorthand 3-digit hex to 6-digit
      const digits = hexMatch[1];
      const hex =
        digits.length === 3 || digits.length === 4
          ? '#' +
            digits
              .slice(0, 3)
              .split('')
              .map(c => c + c)
              .join('')
          : '#' + digits.slice(0, 6);
      varMap.set(name, hex.toLowerCase());
      return;
    }
    // Accept rgb/rgba literals and convert
    const asHex = rgbToHex(trimmed);
    if (asHex) {
      varMap.set(name, asHex);
    }
  };

  // Parse every <style> element's text
  doc.querySelectorAll('style').forEach(styleEl => {
    const text = styleEl.textContent ?? '';
    let match: RegExpExecArray | null;
    CSS_VAR_DECL_RE.lastIndex = 0;
    while ((match = CSS_VAR_DECL_RE.exec(text)) !== null) {
      registerDecl(match[1], match[2]);
    }
  });

  // Also check inline style on <html>/<body> for custom property overrides
  const rootInline = doc.documentElement.getAttribute('style') ?? '';
  if (rootInline) {
    CSS_VAR_DECL_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = CSS_VAR_DECL_RE.exec(rootInline)) !== null) {
      registerDecl(match[1], match[2]);
    }
  }

  return varMap;
};

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
    const [, r, g, b, a] = rgbaMatch;
    // Check if it's fully transparent black or has zero alpha
    const alpha = parseFloat(a);
    return r === '0' && g === '0' && b === '0' && alpha === 0;
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
  const doc = root.ownerDocument ?? document;

  // Build a map of CSS variable name → resolved hex color by parsing <style> elements.
  // We do this once per extraction because jsdom does not support var() resolution in
  // getComputedStyle, so we fall back to our own parser.
  const cssVarColors = extractCssVariables(doc);

  // Build an inverse map: hex → variable name (first declaration wins).
  // Used to look up which variable name corresponds to a resolved hex color when the
  // computed style has already resolved the variable.
  const hexToVarName = new Map<string, string>();
  cssVarColors.forEach((hex, name) => {
    if (!hexToVarName.has(hex)) {
      hexToVarName.set(hex, name);
    }
  });

  const elements = root.querySelectorAll('*');

  elements.forEach(el => {
    const inlineStyles = (el as HTMLElement).style;
    const computedStyles = getComputedStyle(el);
    COLOR_PROPERTIES.forEach(prop => {
      // Only process properties explicitly declared on this element (inline or via stylesheet).
      // Checking the inline style attribute prevents counting inherited values from ancestors.
      const inlineValue = inlineStyles.getPropertyValue(prop);
      if (!inlineValue) return;

      // Detect whether the inline declaration references a CSS variable.
      const varMatch = CSS_VAR_USAGE_RE.exec(inlineValue);
      const declaredVarName = varMatch ? varMatch[1] : undefined;

      // Determine the resolved hex color. When a var() is used, jsdom won't resolve
      // it via getComputedStyle, so we look it up in our parsed variable map.
      let hex: string | null = null;
      if (declaredVarName) {
        hex = cssVarColors.get(declaredVarName) ?? null;
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

      const existing = colorMap.get(hex);
      if (existing) {
        existing.usageCount++;
        if (!existing.properties.includes(prop)) {
          existing.properties.push(prop);
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
          ...(cssVariable ? { cssVariable } : {}),
        });
      }
    });
  });

  return Array.from(colorMap.values()).sort((a, b) => b.usageCount - a.usageCount);
};

export { extractColors };
