import type { StylesheetToken } from './types.js';

// Matches a CSS custom property declaration: --name: value
// Intentionally kept simple — handles single-line declarations inside any rule block.
const CSS_VAR_DECL_RE = /(-{2}[\w-]+)\s*:\s*([^;}\n]+)/g;

interface ScanResult {
  tokens: StylesheetToken[];
  colorVarMap: Map<string, string>;
  hexToVarName: Map<string, string>;
}

/**
 * Attempt to resolve a raw CSS value string to a normalised 6-digit hex color.
 *
 * Handles:
 * - 3-digit hex (#f0f) → 6-digit (#ff00ff)
 * - 6-digit hex → lowercase
 * - rgb(r, g, b) → hex
 * - rgba(r, g, b, a) with a < 1 → null (not a solid color)
 *
 * Returns null when the value cannot be resolved to a solid color.
 */
const resolveToHex = (rawValue: string): string | null => {
  const trimmed = rawValue.trim();

  // 3 or 6-digit hex
  const hexMatch = trimmed.match(/^#([0-9a-fA-F]{3,8})$/);
  if (hexMatch) {
    const digits = hexMatch[1];
    if (digits.length === 3 || digits.length === 4) {
      // Expand shorthand: #abc → #aabbcc (ignore 4th digit if present)
      const expanded =
        '#' +
        digits
          .slice(0, 3)
          .split('')
          .map(c => c + c)
          .join('');
      return expanded.toLowerCase();
    }
    // Use first 6 digits of 6/8-digit hex
    return ('#' + digits.slice(0, 6)).toLowerCase();
  }

  // rgb() / rgba()
  const rgbMatch = trimmed.match(/rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)/);
  if (rgbMatch) {
    const alpha = rgbMatch[4] !== undefined ? parseFloat(rgbMatch[4]) : 1;
    if (alpha < 1) return null;
    const r = Number(rgbMatch[1]);
    const g = Number(rgbMatch[2]);
    const b = Number(rgbMatch[3]);
    return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
  }

  return null;
};

/**
 * Walk `document.styleSheets` and `<style>` elements to extract CSS custom
 * properties (variables), building maps that other extractors will use.
 *
 * Returns:
 * - `tokens`      — all CSS custom properties found across all sources
 * - `colorVarMap` — variable name → normalised hex (color vars only)
 * - `hexToVarName`— normalised hex → first variable name that declared it
 */
const scanStylesheets = (doc: Document): ScanResult => {
  const tokens: StylesheetToken[] = [];
  const colorVarMap = new Map<string, string>();
  const hexToVarName = new Map<string, string>();

  const registerDecl = (name: string, rawValue: string, source: StylesheetToken['source']) => {
    const value = rawValue.trim();
    const resolvedHex = resolveToHex(value) ?? undefined;

    const token: StylesheetToken = { name, value, source };
    if (resolvedHex !== undefined) {
      token.resolvedHex = resolvedHex;
    }
    tokens.push(token);

    if (resolvedHex !== undefined) {
      colorVarMap.set(name, resolvedHex);
      if (!hexToVarName.has(resolvedHex)) {
        hexToVarName.set(resolvedHex, name);
      }
    }
  };

  const parseText = (text: string, source: StylesheetToken['source']) => {
    CSS_VAR_DECL_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = CSS_VAR_DECL_RE.exec(text)) !== null) {
      registerDecl(match[1], match[2], source);
    }
  };

  // 1. Parse <style> element textContent
  doc.querySelectorAll('style').forEach(styleEl => {
    parseText(styleEl.textContent ?? '', 'stylesheet');
  });

  // 2. Try CSSOM access for <link> stylesheets — catch SecurityError for cross-origin
  try {
    const sheets = doc.styleSheets;
    for (let i = 0; i < sheets.length; i++) {
      const sheet = sheets[i];
      // Skip <style>-backed sheets already handled above; ownerNode is a HTMLStyleElement
      if (sheet.ownerNode instanceof doc.defaultView!.HTMLStyleElement) continue;
      try {
        const rules = sheet.cssRules;
        for (let r = 0; r < rules.length; r++) {
          const rule = rules[r];
          parseText(rule.cssText, 'stylesheet');
        }
      } catch {
        // SecurityError: cross-origin stylesheet — skip silently
      }
    }
  } catch {
    // styleSheets access itself failed — skip
  }

  // 3. Inline style on <html> element for custom property overrides
  const rootInline = doc.documentElement.getAttribute('style') ?? '';
  if (rootInline) {
    parseText(rootInline, 'inline');
  }

  return { tokens, colorVarMap, hexToVarName };
};

export type { ScanResult };
export { resolveToHex, scanStylesheets };
