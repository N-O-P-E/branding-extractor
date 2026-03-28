# Live Design System Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform Branding Extractor from a read-only extraction tool into a live design system editor where users can extract styles from any website (including stylesheet-applied styles), modify tokens, see changes live, and export the modified design system.

**Architecture:** Two-pass extraction (stylesheet scan + parent-diff) replaces inline-only guards. An override engine injects a `<style>` element into pages for live editing. Sessions persist edits per-origin in Chrome storage. A VIR-style inspector enables element-level overrides.

**Tech Stack:** WXT, React, Tailwind, Chrome Storage API, CSSOM, Chrome Extension Messaging

---

## File Map

### New Files

| Path | Responsibility |
|------|----------------|
| `packages/extractor/src/stylesheet-scanner.ts` | Walk `document.styleSheets`, extract CSS variables, build selector→value mappings |
| `packages/extractor/src/parent-diff.ts` | Compare element's computed style to parent's to detect directly-applied styles |
| `packages/extractor/src/override-engine.ts` | Manage injected `<style>` element, build CSS rules from token edits |
| `packages/extractor/src/__tests__/stylesheet-scanner.test.ts` | Tests for stylesheet scanning |
| `packages/extractor/src/__tests__/parent-diff.test.ts` | Tests for parent-diff utility |
| `packages/extractor/src/__tests__/override-engine.test.ts` | Tests for override engine |
| `pages/side-panel/src/hooks/useOverrides.ts` | React hook managing override state and messaging |
| `pages/side-panel/src/components/ColorEditor.tsx` | Color swatch with inline color picker |
| `pages/side-panel/src/components/TypographyEditor.tsx` | Typography row with font/size/weight editing |
| `pages/side-panel/src/components/SpacingEditor.tsx` | Spacing value with editable input |
| `pages/side-panel/src/components/OverrideToggle.tsx` | Pill switch for original/modified view |
| `pages/side-panel/src/views/ElementDetailView.tsx` | Inspector element detail panel |
| `packages/exporter/src/session.ts` | `.branding.json` export/import |
| `packages/extractor/src/screenshot.ts` | Full-page screenshot stitching |

### Modified Files

| Path | Change |
|------|--------|
| `packages/extractor/src/types.ts` | Add `selectors` field to ExtractedColor/Typography/Spacing, add `TokenOverride` and `StylesheetToken` types |
| `packages/extractor/src/colors.ts` | Replace inline-only guard with parent-diff |
| `packages/extractor/src/typography.ts` | Replace inline-only guard with parent-diff |
| `packages/extractor/src/spacing.ts` | Replace inline-only guard with parent-diff |
| `packages/extractor/src/components.ts` | Use parent-diff for style-based heuristics |
| `packages/extractor/src/animations.ts` | Use parent-diff + scan stylesheet rules for transitions/animations |
| `packages/extractor/index.mts` | Re-export new modules |
| `packages/shared/lib/messages.ts` | Add override, inspector, and session messages |
| `packages/storage/src/brandings.ts` | Merge `SavedBranding` with session model (add `overrides`, `enabled`) |
| `pages/content/src/matches/all/index.ts` | Add override handlers, session init on load |
| `pages/content-ui/src/matches/all/App.tsx` | Inspector overlay (highlight, tooltip, click-to-select) |
| `pages/side-panel/src/SidePanel.tsx` | Add override toggle, inspector button, session state |
| `pages/side-panel/src/components/ExportModal.tsx` | Add session tab, original/modified toggle |
| `pages/side-panel/src/views/BrandingsView.tsx` | Add import button, session indicators |
| `chrome-extension/manifest.ts` | Add `scripting` permission for programmatic injection |

---

## Phase 1: Extraction Foundation

### Task 1: Extend Types

**Files:**
- Modify: `packages/extractor/src/types.ts`

- [ ] **Step 1: Add new types and fields**

```typescript
// packages/extractor/src/types.ts

// --- Add to ExtractedColor ---
export interface ExtractedColor {
  hex: string;
  rgb: { r: number; g: number; b: number };
  hsl: { h: number; s: number; l: number };
  usageCount: number;
  properties: string[];
  cssVariable?: string;
  selectors: string[]; // NEW: CSS selectors of elements using this color
}

// --- Add to ExtractedTypography ---
export interface ExtractedTypography {
  fontFamily: string;
  fontSize: string;
  fontWeight: string;
  lineHeight: string;
  letterSpacing: string;
  usageCount: number;
  element?: string;
  selectors: string[]; // NEW
}

// --- Add to ExtractedSpacing ---
export interface ExtractedSpacing {
  value: string;
  usageCount: number;
  properties: string[];
  selectors: string[]; // NEW
}

// --- Keep ExtractedComponent and ExtractedAnimation unchanged ---

// --- NEW types ---

/** A CSS custom property discovered in a stylesheet */
export interface StylesheetToken {
  name: string;         // e.g., '--color-primary'
  value: string;        // e.g., '#3b82f6'
  resolvedHex?: string; // normalised hex for color tokens
  source: 'stylesheet' | 'inline'; // where it was declared
}

/** A user's modification to a design token */
export interface TokenOverride {
  tokenId: string;         // e.g., '--color-primary' or 'color-#3b82f6'
  originalValue: string;
  modifiedValue: string;
  type: 'cssVariable' | 'computed';
  selectors?: string[];    // for computed token overrides (Level 2)
}

// --- Add tokens field to ExtractionResult ---
export interface ExtractionResult {
  colors: ExtractedColor[];
  typography: ExtractedTypography[];
  spacing: ExtractedSpacing[];
  components: ExtractedComponent[];
  animations: ExtractedAnimation[];
  tokens: StylesheetToken[]; // NEW: all CSS custom properties found
  timestamp: number;
  url: string;
}
```

- [ ] **Step 2: Run build to check for type errors**

```bash
cd packages/extractor && pnpm type-check
```

Expected: Type errors in existing code where `selectors` and `tokens` are now required. This is expected — we'll fix each extractor in subsequent tasks.

- [ ] **Step 3: Commit**

```bash
git add packages/extractor/src/types.ts
git commit -m "feat: extend extraction types with selectors, tokens, and override types"
```

---

### Task 2: Stylesheet Scanner

**Files:**
- Create: `packages/extractor/src/stylesheet-scanner.ts`
- Create: `packages/extractor/src/__tests__/stylesheet-scanner.test.ts`
- Modify: `packages/extractor/index.mts`

- [ ] **Step 1: Write failing tests**

```typescript
// packages/extractor/src/__tests__/stylesheet-scanner.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import { scanStylesheets } from '../stylesheet-scanner';

describe('scanStylesheets', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    document.head.querySelectorAll('style').forEach(el => el.remove());
  });

  it('extracts CSS variables from style elements', () => {
    const style = document.createElement('style');
    style.textContent = ':root { --primary: #3b82f6; --spacing-md: 16px; }';
    document.head.appendChild(style);

    const result = scanStylesheets(document);
    expect(result.tokens).toContainEqual(
      expect.objectContaining({ name: '--primary', value: '#3b82f6' }),
    );
    expect(result.tokens).toContainEqual(
      expect.objectContaining({ name: '--spacing-md', value: '16px' }),
    );
  });

  it('extracts CSS variables from nested selectors', () => {
    const style = document.createElement('style');
    style.textContent = '.dark { --bg: #0f172a; }';
    document.head.appendChild(style);

    const result = scanStylesheets(document);
    expect(result.tokens).toContainEqual(
      expect.objectContaining({ name: '--bg', value: '#0f172a' }),
    );
  });

  it('returns empty tokens when no stylesheets exist', () => {
    const result = scanStylesheets(document);
    expect(result.tokens).toEqual([]);
  });

  it('builds a variable-to-value map for color variables', () => {
    const style = document.createElement('style');
    style.textContent = ':root { --brand: #e11d48; }';
    document.head.appendChild(style);

    const result = scanStylesheets(document);
    expect(result.colorVarMap.get('--brand')).toBe('#e11d48');
  });

  it('normalises shorthand hex to 6-digit', () => {
    const style = document.createElement('style');
    style.textContent = ':root { --accent: #f0f; }';
    document.head.appendChild(style);

    const result = scanStylesheets(document);
    expect(result.colorVarMap.get('--accent')).toBe('#ff00ff');
  });

  it('handles rgb() values in variables', () => {
    const style = document.createElement('style');
    style.textContent = ':root { --text: rgb(15, 23, 42); }';
    document.head.appendChild(style);

    const result = scanStylesheets(document);
    expect(result.colorVarMap.get('--text')).toBe('#0f172a');
  });

  it('categorises tokens by type', () => {
    const style = document.createElement('style');
    style.textContent = ':root { --color-primary: #3b82f6; --font-body: Inter, sans-serif; --space-4: 16px; }';
    document.head.appendChild(style);

    const result = scanStylesheets(document);
    const colorToken = result.tokens.find(t => t.name === '--color-primary');
    expect(colorToken?.resolvedHex).toBe('#3b82f6');

    const fontToken = result.tokens.find(t => t.name === '--font-body');
    expect(fontToken?.resolvedHex).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd packages/extractor && pnpm test
```

Expected: FAIL — `scanStylesheets` doesn't exist yet.

- [ ] **Step 3: Implement stylesheet scanner**

```typescript
// packages/extractor/src/stylesheet-scanner.ts
import type { StylesheetToken } from './types.js';

/** Regex to match CSS custom property declarations: --name: value; */
const CSS_VAR_DECL_RE = /(-{2}[\w-]+)\s*:\s*([^;}\n]+)/g;

interface ScanResult {
  /** All CSS custom properties found across all stylesheets */
  tokens: StylesheetToken[];
  /** Map of color variable name → normalised hex value */
  colorVarMap: Map<string, string>;
  /** Inverse map: hex → first variable name that resolves to it */
  hexToVarName: Map<string, string>;
}

/**
 * Convert an rgb/rgba string to 6-digit hex. Returns null if not a colour.
 */
const rgbToHex = (rgb: string): string | null => {
  const match = rgb.match(/rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (!match) return null;
  const [, r, g, b] = match.map(Number);
  return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
};

/**
 * Try to resolve a raw CSS value to a normalised 6-digit hex colour.
 * Returns undefined if the value is not a recognisable colour.
 */
const resolveToHex = (raw: string): string | undefined => {
  const trimmed = raw.trim();

  // 3/4/6/8-digit hex
  const hexMatch = trimmed.match(/^#([0-9a-fA-F]{3,8})$/);
  if (hexMatch) {
    const digits = hexMatch[1];
    if (digits.length === 3 || digits.length === 4) {
      return (
        '#' +
        digits
          .slice(0, 3)
          .split('')
          .map(c => c + c)
          .join('')
      ).toLowerCase();
    }
    return ('#' + digits.slice(0, 6)).toLowerCase();
  }

  // rgb()/rgba()
  const hex = rgbToHex(trimmed);
  if (hex) return hex;

  return undefined;
};

/**
 * Parse CSS text (from a <style> element or fetched stylesheet) for custom
 * property declarations.
 */
const parseDeclarations = (cssText: string, tokens: StylesheetToken[], colorVarMap: Map<string, string>) => {
  CSS_VAR_DECL_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = CSS_VAR_DECL_RE.exec(cssText)) !== null) {
    const name = match[1];
    const value = match[2].trim();
    const resolvedHex = resolveToHex(value);

    tokens.push({
      name,
      value,
      resolvedHex,
      source: 'stylesheet',
    });

    if (resolvedHex) {
      // First declaration wins for the colour map
      if (!colorVarMap.has(name)) {
        colorVarMap.set(name, resolvedHex);
      }
    }
  }
};

/**
 * Scan all stylesheets in the document for CSS custom properties.
 *
 * For same-origin stylesheets, walks the CSSOM rule tree.
 * For cross-origin stylesheets, falls back to parsing <style> textContent
 * or skips if inaccessible.
 */
const scanStylesheets = (doc: Document): ScanResult => {
  const tokens: StylesheetToken[] = [];
  const colorVarMap = new Map<string, string>();

  // 1. Parse all <style> elements directly (works in jsdom and browsers)
  doc.querySelectorAll('style').forEach(styleEl => {
    const text = styleEl.textContent ?? '';
    parseDeclarations(text, tokens, colorVarMap);
  });

  // 2. Try CSSOM access for <link> stylesheets (may throw on cross-origin)
  try {
    for (let i = 0; i < doc.styleSheets.length; i++) {
      const sheet = doc.styleSheets[i];
      // Skip inline <style> elements — already parsed above
      if (sheet.ownerNode && (sheet.ownerNode as HTMLElement).tagName === 'STYLE') continue;

      try {
        const rules = sheet.cssRules;
        for (let j = 0; j < rules.length; j++) {
          parseDeclarations(rules[j].cssText, tokens, colorVarMap);
        }
      } catch {
        // Cross-origin stylesheet — access denied, skip gracefully
      }
    }
  } catch {
    // styleSheets API not available (rare)
  }

  // 3. Check inline style on <html> for custom property overrides
  const rootInline = doc.documentElement.getAttribute('style') ?? '';
  if (rootInline) {
    parseDeclarations(rootInline, tokens, colorVarMap);
  }

  // Build inverse map: hex → first variable name
  const hexToVarName = new Map<string, string>();
  colorVarMap.forEach((hex, name) => {
    if (!hexToVarName.has(hex)) {
      hexToVarName.set(hex, name);
    }
  });

  return { tokens, colorVarMap, hexToVarName };
};

export { scanStylesheets, resolveToHex };
export type { ScanResult };
```

- [ ] **Step 4: Update index.mts**

Add to `packages/extractor/index.mts`:

```typescript
export * from './src/stylesheet-scanner.js';
```

- [ ] **Step 5: Run tests**

```bash
cd packages/extractor && pnpm test
```

Expected: All stylesheet-scanner tests PASS. Some existing tests may fail due to the new required `selectors` field — that's expected and will be fixed in subsequent tasks.

- [ ] **Step 6: Commit**

```bash
git add packages/extractor/src/stylesheet-scanner.ts packages/extractor/src/__tests__/stylesheet-scanner.test.ts packages/extractor/index.mts
git commit -m "feat: add stylesheet scanner for CSS variable extraction"
```

---

### Task 3: Parent-Diff Utility

**Files:**
- Create: `packages/extractor/src/parent-diff.ts`
- Create: `packages/extractor/src/__tests__/parent-diff.test.ts`
- Modify: `packages/extractor/index.mts`

- [ ] **Step 1: Write failing tests**

```typescript
// packages/extractor/src/__tests__/parent-diff.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import { hasDirectStyle, buildSelector } from '../parent-diff';

describe('hasDirectStyle', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    document.head.querySelectorAll('style').forEach(el => el.remove());
  });

  it('returns true when element has inline style', () => {
    document.body.innerHTML = '<div style="color: red;"><span>text</span></div>';
    const div = document.querySelector('div')!;
    expect(hasDirectStyle(div, 'color')).toBe(true);
  });

  it('returns false for inherited computed style', () => {
    document.body.innerHTML = '<div style="color: red;"><span>text</span></div>';
    const span = document.querySelector('span')!;
    // In jsdom, computed styles may not inherit properly, so this tests the logic
    expect(hasDirectStyle(span, 'color')).toBe(false);
  });

  it('returns true when computed style differs from parent', () => {
    document.body.innerHTML = '<div style="color: red;"><p style="color: blue;">text</p></div>';
    const p = document.querySelector('p')!;
    expect(hasDirectStyle(p, 'color')).toBe(true);
  });

  it('returns true for inline style even when same as parent', () => {
    document.body.innerHTML = '<div style="color: red;"><span style="color: red;">text</span></div>';
    const span = document.querySelector('span')!;
    expect(hasDirectStyle(span, 'color')).toBe(true);
  });
});

describe('buildSelector', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('builds selector from tag and class', () => {
    document.body.innerHTML = '<h1 class="title hero-text">Hello</h1>';
    const h1 = document.querySelector('h1')!;
    expect(buildSelector(h1)).toBe('h1.title');
  });

  it('builds selector from tag and id', () => {
    document.body.innerHTML = '<div id="main">Hello</div>';
    const div = document.querySelector('div')!;
    expect(buildSelector(div)).toBe('div#main');
  });

  it('falls back to tag name', () => {
    document.body.innerHTML = '<p>Hello</p>';
    const p = document.querySelector('p')!;
    expect(buildSelector(p)).toBe('p');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd packages/extractor && pnpm test
```

Expected: FAIL — `hasDirectStyle` and `buildSelector` don't exist.

- [ ] **Step 3: Implement parent-diff utility**

```typescript
// packages/extractor/src/parent-diff.ts

/**
 * Determine whether an element has a CSS property applied directly to it
 * (via inline style or a stylesheet rule targeting it), as opposed to
 * inheriting the value from an ancestor.
 *
 * Strategy:
 * 1. If the element has the property in its inline `style` attribute → true.
 * 2. If the element's computed value differs from its parent's computed value → true.
 * 3. Otherwise → false (the value is inherited).
 */
const hasDirectStyle = (el: Element, property: string): boolean => {
  const htmlEl = el as HTMLElement;

  // Check 1: inline style declares this property
  if (htmlEl.style && htmlEl.style.getPropertyValue(property)) {
    return true;
  }

  // Check 2: computed value differs from parent
  const parent = el.parentElement;
  if (!parent) return true; // root element — treat everything as direct

  const elComputed = getComputedStyle(el).getPropertyValue(property);
  const parentComputed = getComputedStyle(parent).getPropertyValue(property);

  return elComputed !== parentComputed;
};

/**
 * Check if an element has ANY of the given properties applied directly.
 */
const hasAnyDirectStyle = (el: Element, properties: readonly string[]): boolean =>
  properties.some(prop => hasDirectStyle(el, prop));

/**
 * Build a simple CSS selector for an element.
 * Priority: tag#id > tag.firstClass > tag[role] > tag[type] > tag
 */
const buildSelector = (el: Element): string => {
  const tag = el.tagName.toLowerCase();

  if (el.id) return `${tag}#${el.id}`;

  const firstClass = el.classList[0];
  if (firstClass) return `${tag}.${firstClass}`;

  const role = el.getAttribute('role');
  if (role) return `${tag}[role="${role}"]`;

  const type = el.getAttribute('type');
  if (type) return `${tag}[type="${type}"]`;

  return tag;
};

export { hasDirectStyle, hasAnyDirectStyle, buildSelector };
```

- [ ] **Step 4: Update index.mts**

Add to `packages/extractor/index.mts`:

```typescript
export * from './src/parent-diff.js';
```

- [ ] **Step 5: Run tests**

```bash
cd packages/extractor && pnpm test
```

Expected: parent-diff tests PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/extractor/src/parent-diff.ts packages/extractor/src/__tests__/parent-diff.test.ts packages/extractor/index.mts
git commit -m "feat: add parent-diff utility for stylesheet style detection"
```

---

### Task 4: Update Colors Extractor

**Files:**
- Modify: `packages/extractor/src/colors.ts`
- Modify: `packages/extractor/src/__tests__/colors.test.ts`

- [ ] **Step 1: Add stylesheet-aware test**

Add to the existing test file:

```typescript
it('extracts colors applied via stylesheet (parent-diff)', () => {
  // In jsdom, we simulate stylesheet-applied styles via inline on a child
  // whose parent has a different value — triggering the parent-diff path
  document.body.innerHTML = `
    <div style="color: rgb(0, 0, 0);">
      <h1 style="color: rgb(59, 130, 246);">Title</h1>
    </div>
  `;
  const colors = extractColors(document.body);
  const blue = colors.find(c => c.hex === '#3b82f6');
  expect(blue).toBeDefined();
  expect(blue?.selectors).toContain('h1');
});

it('populates selectors array', () => {
  document.body.innerHTML = '<p class="intro" style="color: #ff0000;">Test</p>';
  const colors = extractColors(document.body);
  const red = colors.find(c => c.hex === '#ff0000');
  expect(red?.selectors).toContain('p.intro');
});
```

- [ ] **Step 2: Run tests to see failures**

```bash
cd packages/extractor && pnpm test src/__tests__/colors.test.ts
```

Expected: FAIL — `selectors` field doesn't exist in output yet.

- [ ] **Step 3: Update colors.ts to use parent-diff and populate selectors**

Key changes to `extractColors`:
- Import `hasDirectStyle` and `buildSelector` from `./parent-diff.js`
- Import `scanStylesheets` from `./stylesheet-scanner.js`
- Replace the `if (!inlineValue) return;` guard with `if (!hasDirectStyle(el, prop)) return;`
- Add `selectors: []` to new `ExtractedColor` entries
- Push `buildSelector(el)` to `existing.selectors` (deduplicated)
- Move CSS variable scanning to use `scanStylesheets` result
- Add `tokens` field assembly (pass through from scanner)

The full implementation replaces the inline-only guard while preserving all existing logic for deduplication, hex conversion, HSL, and CSS variable linking.

- [ ] **Step 4: Fix existing tests that break due to new `selectors` field**

Update existing test assertions to include `selectors` in `objectContaining` checks or use partial matching.

- [ ] **Step 5: Run all color tests**

```bash
cd packages/extractor && pnpm test src/__tests__/colors.test.ts
```

Expected: All PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/extractor/src/colors.ts packages/extractor/src/__tests__/colors.test.ts
git commit -m "feat: upgrade color extraction to use parent-diff and populate selectors"
```

---

### Task 5: Update Typography Extractor

**Files:**
- Modify: `packages/extractor/src/typography.ts`
- Modify: `packages/extractor/src/__tests__/typography.test.ts`

- [ ] **Step 1: Add stylesheet-aware test**

```typescript
it('populates selectors array', () => {
  document.body.innerHTML = '<h1 class="title" style="font-family: Inter; font-size: 32px;">Title</h1>';
  const typography = extractTypography(document.body);
  expect(typography[0]?.selectors).toContain('h1.title');
});
```

- [ ] **Step 2: Update typography.ts**

Key changes:
- Import `hasAnyDirectStyle` and `buildSelector` from `./parent-diff.js`
- Replace `hasAnyTypographyInline` check with `hasAnyDirectStyle(el, TYPOGRAPHY_PROPERTIES)`
- Add `selectors: []` to new entries, push `buildSelector(el)` on match

- [ ] **Step 3: Fix existing tests, run all**

```bash
cd packages/extractor && pnpm test src/__tests__/typography.test.ts
```

Expected: All PASS.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat: upgrade typography extraction to use parent-diff and populate selectors"
```

---

### Task 6: Update Spacing Extractor

**Files:**
- Modify: `packages/extractor/src/spacing.ts`
- Modify: `packages/extractor/src/__tests__/spacing.test.ts`

Same pattern as Task 5:
- Replace inline-only guards with `hasDirectStyle` calls
- Add `selectors: []` to entries, populate with `buildSelector(el)`
- Update tests

- [ ] **Step 1: Add selector test, update spacing.ts, fix tests**

- [ ] **Step 2: Run tests**

```bash
cd packages/extractor && pnpm test src/__tests__/spacing.test.ts
```

- [ ] **Step 3: Commit**

```bash
git commit -m "feat: upgrade spacing extraction to use parent-diff and populate selectors"
```

---

### Task 7: Update Components Extractor

**Files:**
- Modify: `packages/extractor/src/components.ts`
- Modify: `packages/extractor/src/__tests__/components.test.ts`

Key changes:
- Import `hasDirectStyle` from `./parent-diff.js`
- In `classifyElement`, replace `inlineStyles.getPropertyValue(prop)` checks with `hasDirectStyle(el, prop)` for card detection traits and button-like style detection
- In `extractElementStyles`, use `hasDirectStyle` instead of inline-only guard
- Update `hasButtonLikeStyles` to use `hasDirectStyle`

- [ ] **Step 1: Update components.ts and tests**

- [ ] **Step 2: Run tests**

```bash
cd packages/extractor && pnpm test src/__tests__/components.test.ts
```

- [ ] **Step 3: Commit**

```bash
git commit -m "feat: upgrade component detection to use parent-diff"
```

---

### Task 8: Update Animations Extractor

**Files:**
- Modify: `packages/extractor/src/animations.ts`
- Modify: `packages/extractor/src/__tests__/animations.test.ts`

Key changes:
- Import `hasDirectStyle` from `./parent-diff.js`
- Replace `if (!style.length) return;` with checks using `hasDirectStyle` for `transition` and `animation` properties
- For the parent-diff approach: read both inline `style.getPropertyValue('transition')` and `getComputedStyle(el).getPropertyValue('transition')`, using whichever is non-empty when the element has a direct style

- [ ] **Step 1: Update animations.ts and tests**

- [ ] **Step 2: Run tests**

```bash
cd packages/extractor && pnpm test src/__tests__/animations.test.ts
```

- [ ] **Step 3: Commit**

```bash
git commit -m "feat: upgrade animation extraction to use parent-diff"
```

---

### Task 9: Update Content Script to Pass Tokens

**Files:**
- Modify: `pages/content/src/matches/all/index.ts`

- [ ] **Step 1: Import scanStylesheets, assemble tokens into result**

```typescript
import {
  extractColors,
  extractTypography,
  extractSpacing,
  detectComponents,
  extractAnimations,
  scanStylesheets,
} from '@extension/extractor';
import type { ExtensionMessage, ExtractStylesResponse } from '@extension/shared';

chrome.runtime.onMessage.addListener(
  (message: ExtensionMessage, _sender, sendResponse: (response: ExtractStylesResponse) => void) => {
    if (message.type === 'EXTRACT_STYLES') {
      const scan = scanStylesheets(document);
      const result = {
        colors: extractColors(document.body),
        typography: extractTypography(document.body),
        spacing: extractSpacing(document.body),
        components: detectComponents(document.body),
        animations: extractAnimations(document.body),
        tokens: scan.tokens,
        timestamp: Date.now(),
        url: window.location.href,
      };
      sendResponse({ result });
    }

    return true;
  },
);
```

- [ ] **Step 2: Build and verify**

```bash
pnpm build
```

- [ ] **Step 3: Commit**

```bash
git commit -m "feat: pass stylesheet tokens through content script extraction"
```

---

## Phase 2: Override Engine

### Task 10: Override Engine Core

**Files:**
- Create: `packages/extractor/src/override-engine.ts`
- Create: `packages/extractor/src/__tests__/override-engine.test.ts`
- Modify: `packages/extractor/index.mts`

- [ ] **Step 1: Write failing tests**

```typescript
// packages/extractor/src/__tests__/override-engine.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import { OverrideEngine } from '../override-engine';

describe('OverrideEngine', () => {
  let engine: OverrideEngine;

  afterEach(() => {
    engine?.destroy();
    document.head.querySelectorAll('style').forEach(el => el.remove());
  });

  it('injects a style element into the document', () => {
    engine = new OverrideEngine(document);
    const styleEl = document.getElementById('branding-extractor-overrides');
    expect(styleEl).not.toBeNull();
    expect(styleEl?.tagName).toBe('STYLE');
  });

  it('applies CSS variable override', () => {
    engine = new OverrideEngine(document);
    engine.applyOverride({
      tokenId: '--color-primary',
      originalValue: '#3b82f6',
      modifiedValue: '#e11d48',
      type: 'cssVariable',
    });

    const styleEl = document.getElementById('branding-extractor-overrides');
    expect(styleEl?.textContent).toContain('--color-primary: #e11d48 !important');
  });

  it('applies computed token override with selectors', () => {
    engine = new OverrideEngine(document);
    engine.applyOverride({
      tokenId: 'color-#3b82f6',
      originalValue: '#3b82f6',
      modifiedValue: '#e11d48',
      type: 'computed',
      selectors: ['h1.title', '.nav-link'],
    });

    const styleEl = document.getElementById('branding-extractor-overrides');
    expect(styleEl?.textContent).toContain('h1.title');
    expect(styleEl?.textContent).toContain('.nav-link');
    expect(styleEl?.textContent).toContain('#e11d48');
  });

  it('removes an override', () => {
    engine = new OverrideEngine(document);
    engine.applyOverride({
      tokenId: '--color-primary',
      originalValue: '#3b82f6',
      modifiedValue: '#e11d48',
      type: 'cssVariable',
    });
    engine.removeOverride('--color-primary');

    const styleEl = document.getElementById('branding-extractor-overrides');
    expect(styleEl?.textContent).not.toContain('--color-primary');
  });

  it('toggles enabled state via disabled attribute', () => {
    engine = new OverrideEngine(document);
    engine.setEnabled(false);
    const styleEl = document.getElementById('branding-extractor-overrides') as HTMLStyleElement;
    expect(styleEl.disabled).toBe(true);

    engine.setEnabled(true);
    expect(styleEl.disabled).toBe(false);
  });

  it('clears all overrides', () => {
    engine = new OverrideEngine(document);
    engine.applyOverride({
      tokenId: '--a',
      originalValue: '#000',
      modifiedValue: '#fff',
      type: 'cssVariable',
    });
    engine.applyOverride({
      tokenId: '--b',
      originalValue: '#111',
      modifiedValue: '#222',
      type: 'cssVariable',
    });
    engine.clearAll();

    const styleEl = document.getElementById('branding-extractor-overrides');
    expect(styleEl?.textContent?.trim()).toBe('');
  });

  it('returns current overrides', () => {
    engine = new OverrideEngine(document);
    const override = {
      tokenId: '--x',
      originalValue: '#000',
      modifiedValue: '#fff',
      type: 'cssVariable' as const,
    };
    engine.applyOverride(override);
    expect(engine.getOverrides()).toContainEqual(override);
  });
});
```

- [ ] **Step 2: Implement override engine**

```typescript
// packages/extractor/src/override-engine.ts
import type { TokenOverride } from './types.js';

/**
 * Manages a single <style> element injected into the page for live
 * design token overrides. Supports three levels:
 *
 * 1. CSS variable overrides (:root { --var: value !important; })
 * 2. Computed token overrides (selector { prop: value !important; })
 * 3. Element-specific overrides (selector { prop: value !important; })
 */
class OverrideEngine {
  private styleEl: HTMLStyleElement;
  private overrides: Map<string, TokenOverride> = new Map();
  private doc: Document;

  constructor(doc: Document) {
    this.doc = doc;

    // Remove any existing override stylesheet (e.g., from a previous session)
    const existing = doc.getElementById('branding-extractor-overrides');
    if (existing) existing.remove();

    this.styleEl = doc.createElement('style');
    this.styleEl.id = 'branding-extractor-overrides';
    doc.head.appendChild(this.styleEl);
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

  /**
   * Rebuild the entire stylesheet from the current overrides map.
   * This is simpler and more reliable than surgically editing individual rules.
   */
  private rebuild(): void {
    const cssVarLines: string[] = [];
    const ruleLines: string[] = [];

    this.overrides.forEach(override => {
      if (override.type === 'cssVariable') {
        cssVarLines.push(`  ${override.tokenId}: ${override.modifiedValue} !important;`);
      } else if (override.selectors && override.selectors.length > 0) {
        // Determine which CSS property to override based on token ID pattern
        const property = this.inferProperty(override.tokenId);
        const selector = override.selectors.join(', ');
        ruleLines.push(`${selector} { ${property}: ${override.modifiedValue} !important; }`);
      }
    });

    const parts: string[] = [];
    if (cssVarLines.length > 0) {
      parts.push(`:root {\n${cssVarLines.join('\n')}\n}`);
    }
    parts.push(...ruleLines);

    this.styleEl.textContent = parts.join('\n\n');
  }

  /**
   * Infer the CSS property from a computed token ID.
   * Token IDs for computed values follow the pattern: "property-hexvalue"
   * e.g., "color-#3b82f6", "font-family-Inter"
   */
  private inferProperty(tokenId: string): string {
    // For CSS variables, the property is the variable itself
    if (tokenId.startsWith('--')) return tokenId;

    // For computed tokens, extract the property prefix
    const knownPrefixes = [
      'background-color',
      'border-color',
      'color',
      'font-family',
      'font-size',
      'font-weight',
      'line-height',
      'letter-spacing',
      'padding',
      'margin',
      'gap',
    ];

    for (const prefix of knownPrefixes) {
      if (tokenId.startsWith(prefix + '-')) return prefix;
    }

    // Fallback: use the portion before the last dash-separated value
    return tokenId.split('-').slice(0, -1).join('-') || tokenId;
  }
}

export { OverrideEngine };
```

- [ ] **Step 3: Update index.mts**

```typescript
export * from './src/override-engine.js';
```

- [ ] **Step 4: Run tests**

```bash
cd packages/extractor && pnpm test src/__tests__/override-engine.test.ts
```

Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat: add override engine for live style injection"
```

---

### Task 11: Override Message Types

**Files:**
- Modify: `packages/shared/lib/messages.ts`

- [ ] **Step 1: Add override and inspector message types**

```typescript
// packages/shared/lib/messages.ts
import type { ExtractionResult, TokenOverride } from '@extension/extractor';

export interface ExtractStylesMessage {
  type: 'EXTRACT_STYLES';
}

export interface ExtractStylesResponse {
  result: ExtractionResult;
}

export interface ApplyOverrideMessage {
  type: 'APPLY_OVERRIDE';
  payload: TokenOverride;
}

export interface RemoveOverrideMessage {
  type: 'REMOVE_OVERRIDE';
  payload: { tokenId: string };
}

export interface ClearOverridesMessage {
  type: 'CLEAR_ALL_OVERRIDES';
}

export interface SetOverridesEnabledMessage {
  type: 'SET_OVERRIDES_ENABLED';
  payload: { enabled: boolean };
}

export interface GetOverrideStateMessage {
  type: 'GET_OVERRIDE_STATE';
}

export interface GetOverrideStateResponse {
  overrides: TokenOverride[];
  enabled: boolean;
}

export interface ElementSelectedMessage {
  type: 'ELEMENT_SELECTED';
  payload: {
    selector: string;
    computedStyles: Record<string, string>;
    linkedTokens: Record<string, string>; // property → token name
  };
}

export interface ActivateInspectorMessage {
  type: 'ACTIVATE_INSPECTOR';
}

export interface DeactivateInspectorMessage {
  type: 'DEACTIVATE_INSPECTOR';
}

export type ExtensionMessage =
  | ExtractStylesMessage
  | ApplyOverrideMessage
  | RemoveOverrideMessage
  | ClearOverridesMessage
  | SetOverridesEnabledMessage
  | GetOverrideStateMessage
  | ActivateInspectorMessage
  | DeactivateInspectorMessage;
```

- [ ] **Step 2: Build to verify**

```bash
pnpm build
```

- [ ] **Step 3: Commit**

```bash
git commit -m "feat: add override and inspector message types"
```

---

### Task 12: Content Script Override Handlers

**Files:**
- Modify: `pages/content/src/matches/all/index.ts`

- [ ] **Step 1: Add override engine and message handlers**

```typescript
import {
  extractColors,
  extractTypography,
  extractSpacing,
  detectComponents,
  extractAnimations,
  scanStylesheets,
  OverrideEngine,
} from '@extension/extractor';
import type { ExtensionMessage, ExtractStylesResponse, GetOverrideStateResponse } from '@extension/shared';

// Initialise the override engine once per page
let engine: OverrideEngine | null = null;
let overridesEnabled = true;

const getEngine = (): OverrideEngine => {
  if (!engine) {
    engine = new OverrideEngine(document);
  }
  return engine;
};

// Check for an active session on page load
chrome.storage.local.get('brandings').then(({ brandings }) => {
  if (!brandings) return;
  const origin = window.location.origin;
  const session = (brandings as Array<{ origin?: string; overrides?: Array<unknown>; enabled?: boolean }>).find(
    b => b.origin === origin && b.overrides && b.overrides.length > 0 && b.enabled,
  );
  if (session && session.overrides) {
    const eng = getEngine();
    for (const override of session.overrides as Array<import('@extension/extractor').TokenOverride>) {
      eng.applyOverride(override);
    }
    overridesEnabled = true;
  }
});

chrome.runtime.onMessage.addListener(
  (
    message: ExtensionMessage,
    _sender,
    sendResponse: (response: ExtractStylesResponse | GetOverrideStateResponse | void) => void,
  ) => {
    if (message.type === 'EXTRACT_STYLES') {
      const scan = scanStylesheets(document);
      const result = {
        colors: extractColors(document.body),
        typography: extractTypography(document.body),
        spacing: extractSpacing(document.body),
        components: detectComponents(document.body),
        animations: extractAnimations(document.body),
        tokens: scan.tokens,
        timestamp: Date.now(),
        url: window.location.href,
      };
      sendResponse({ result });
    }

    if (message.type === 'APPLY_OVERRIDE') {
      getEngine().applyOverride(message.payload);
    }

    if (message.type === 'REMOVE_OVERRIDE') {
      getEngine().removeOverride(message.payload.tokenId);
    }

    if (message.type === 'CLEAR_ALL_OVERRIDES') {
      getEngine().clearAll();
    }

    if (message.type === 'SET_OVERRIDES_ENABLED') {
      overridesEnabled = message.payload.enabled;
      getEngine().setEnabled(message.payload.enabled);
    }

    if (message.type === 'GET_OVERRIDE_STATE') {
      sendResponse({
        overrides: engine ? engine.getOverrides() : [],
        enabled: overridesEnabled,
      });
    }

    return true;
  },
);
```

- [ ] **Step 2: Build and verify**

```bash
pnpm build
```

- [ ] **Step 3: Commit**

```bash
git commit -m "feat: add override engine and session init to content script"
```

---

## Phase 3: Persistence

### Task 13: Upgrade Storage Model

**Files:**
- Modify: `packages/storage/src/brandings.ts`
- Modify: `packages/storage/index.mts`

- [ ] **Step 1: Merge sessions into SavedBranding**

```typescript
// packages/storage/src/brandings.ts
import type { ExtractionResult, TokenOverride } from '@extension/extractor';

interface SavedBranding {
  id: string;
  name: string;
  url: string;
  origin: string;               // NEW: e.g., 'https://stripe.com'
  favicon?: string;
  data: ExtractionResult;
  overrides: TokenOverride[];   // NEW: user modifications
  enabled: boolean;             // NEW: toggle state
  savedAt: number;
  updatedAt: number;            // NEW: last edit time
}

const saveBranding = async (branding: SavedBranding): Promise<void> => {
  const existing = await chrome.storage.local.get('brandings');
  const brandings: SavedBranding[] = existing.brandings || [];
  brandings.push(branding);
  await chrome.storage.local.set({ brandings });
};

const getBrandings = async (): Promise<SavedBranding[]> => {
  const result = await chrome.storage.local.get('brandings');
  return result.brandings || [];
};

const deleteBranding = async (id: string): Promise<void> => {
  const existing = await chrome.storage.local.get('brandings');
  const brandings: SavedBranding[] = (existing.brandings || []).filter((b: SavedBranding) => b.id !== id);
  await chrome.storage.local.set({ brandings });
};

/** Update a branding's overrides and/or enabled state. */
const updateBranding = async (id: string, updates: Partial<Pick<SavedBranding, 'overrides' | 'enabled' | 'name' | 'updatedAt'>>): Promise<void> => {
  const existing = await chrome.storage.local.get('brandings');
  const brandings: SavedBranding[] = existing.brandings || [];
  const index = brandings.findIndex((b: SavedBranding) => b.id === id);
  if (index === -1) return;
  brandings[index] = { ...brandings[index], ...updates, updatedAt: Date.now() };
  await chrome.storage.local.set({ brandings });
};

/** Find an active (enabled) session for a given origin. */
const getActiveSession = async (origin: string): Promise<SavedBranding | undefined> => {
  const brandings = await getBrandings();
  return brandings.find(b => b.origin === origin && b.enabled && b.overrides.length > 0);
};

export type { SavedBranding };
export { deleteBranding, getActiveSession, getBrandings, saveBranding, updateBranding };
```

- [ ] **Step 2: Build and verify**

```bash
pnpm build
```

- [ ] **Step 3: Commit**

```bash
git commit -m "feat: upgrade storage model with overrides, enabled toggle, and session queries"
```

---

### Task 14: Update SidePanel Save Flow

**Files:**
- Modify: `pages/side-panel/src/SidePanel.tsx`

- [ ] **Step 1: Update handleSaveCurrent to include new fields**

Update the `handleSaveCurrent` callback to populate `origin`, `overrides`, `enabled`, and `updatedAt`:

```typescript
const handleSaveCurrent = useCallback(async () => {
  if (!result) return;
  try {
    const url = new URL(result.url);
    const hostname = url.hostname;
    const favicon = `https://www.google.com/s2/favicons?domain=${hostname}`;
    const newBranding: SavedBranding = {
      id: crypto.randomUUID(),
      name: hostname,
      url: result.url,
      origin: url.origin,
      favicon,
      data: result,
      overrides: [],
      enabled: false,
      savedAt: Date.now(),
      updatedAt: Date.now(),
    };
    await saveBranding(newBranding);
    const updated = await getBrandings();
    setBrandings(updated);
    setSavedToast(true);
    setTimeout(() => setSavedToast(false), 1500);
  } catch (err) {
    console.error('Failed to save branding:', err);
  }
}, [result]);
```

- [ ] **Step 2: Build and verify**

```bash
pnpm build
```

- [ ] **Step 3: Commit**

```bash
git commit -m "feat: update save flow with session fields"
```

---

## Phase 4: Token Editor UI

### Task 15: Override State Management Hook

**Files:**
- Create: `pages/side-panel/src/hooks/useOverrides.ts`

- [ ] **Step 1: Create the hook**

```typescript
// pages/side-panel/src/hooks/useOverrides.ts
import { useCallback, useState } from 'react';
import type { TokenOverride } from '@extension/extractor';

/**
 * React hook that manages token overrides and communicates with the content
 * script's OverrideEngine via chrome.tabs.sendMessage.
 */
const useOverrides = () => {
  const [overrides, setOverrides] = useState<Map<string, TokenOverride>>(new Map());
  const [enabled, setEnabled] = useState(true);

  const sendToActiveTab = useCallback(async (message: Record<string, unknown>) => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      await chrome.tabs.sendMessage(tab.id, message);
    }
  }, []);

  const applyOverride = useCallback(
    async (override: TokenOverride) => {
      setOverrides(prev => {
        const next = new Map(prev);
        next.set(override.tokenId, override);
        return next;
      });
      await sendToActiveTab({ type: 'APPLY_OVERRIDE', payload: override });
    },
    [sendToActiveTab],
  );

  const removeOverride = useCallback(
    async (tokenId: string) => {
      setOverrides(prev => {
        const next = new Map(prev);
        next.delete(tokenId);
        return next;
      });
      await sendToActiveTab({ type: 'REMOVE_OVERRIDE', payload: { tokenId } });
    },
    [sendToActiveTab],
  );

  const clearAll = useCallback(async () => {
    setOverrides(new Map());
    await sendToActiveTab({ type: 'CLEAR_ALL_OVERRIDES' });
  }, [sendToActiveTab]);

  const toggleEnabled = useCallback(
    async (value: boolean) => {
      setEnabled(value);
      await sendToActiveTab({ type: 'SET_OVERRIDES_ENABLED', payload: { enabled: value } });
    },
    [sendToActiveTab],
  );

  const hasOverrides = overrides.size > 0;
  const overridesList = Array.from(overrides.values());

  return {
    overrides,
    overridesList,
    enabled,
    hasOverrides,
    applyOverride,
    removeOverride,
    clearAll,
    toggleEnabled,
  };
};

export { useOverrides };
```

- [ ] **Step 2: Build and verify**

```bash
pnpm build
```

- [ ] **Step 3: Commit**

```bash
git commit -m "feat: add useOverrides hook for override state management"
```

---

### Task 16: Color Editor Component

**Files:**
- Create: `pages/side-panel/src/components/ColorEditor.tsx`

- [ ] **Step 1: Create the color editor**

A version of `ColorSwatches` where each swatch has an attached color picker. When a user picks a new color, it calls `onOverride` with the token override.

```tsx
// pages/side-panel/src/components/ColorEditor.tsx
import { useRef, useState } from 'react';
import type { ExtractedColor, TokenOverride } from '@extension/extractor';

interface Props {
  colors: ExtractedColor[];
  overrides: Map<string, TokenOverride>;
  onOverride: (override: TokenOverride) => void;
  onResetOverride: (tokenId: string) => void;
  onCopy: (value: string) => void;
}

const ColorEditor = ({ colors, overrides, onOverride, onResetOverride, onCopy }: Props) => {
  const [activePickerHex, setActivePickerHex] = useState<string | null>(null);
  const pickerRef = useRef<HTMLInputElement>(null);

  const getTokenId = (color: ExtractedColor): string =>
    color.cssVariable || `color-${color.hex.slice(1)}`;

  const getDisplayHex = (color: ExtractedColor): string => {
    const tokenId = getTokenId(color);
    const override = overrides.get(tokenId);
    return override ? override.modifiedValue : color.hex;
  };

  const handleColorChange = (color: ExtractedColor, newHex: string) => {
    const tokenId = getTokenId(color);
    onOverride({
      tokenId,
      originalValue: color.hex,
      modifiedValue: newHex,
      type: color.cssVariable ? 'cssVariable' : 'computed',
      selectors: color.selectors,
    });
  };

  const isModified = (color: ExtractedColor): boolean =>
    overrides.has(getTokenId(color));

  if (colors.length === 0) {
    return <p style={{ color: 'var(--text-muted)' }} className="text-sm">No colors found</p>;
  }

  return (
    <div className="grid grid-cols-4 gap-2">
      {colors.map(color => {
        const displayHex = getDisplayHex(color);
        const modified = isModified(color);
        const tokenId = getTokenId(color);

        return (
          <div key={color.hex} className="group relative flex flex-col items-center">
            {/* Color swatch — click to open picker */}
            <button
              type="button"
              onClick={() => {
                setActivePickerHex(color.hex);
                // Trigger the hidden color input
                setTimeout(() => pickerRef.current?.click(), 0);
              }}
              className="relative transition-transform group-hover:scale-110"
              title={`${displayHex} — Used ${color.usageCount}x\nClick to edit`}
              style={{ border: modified ? '2px solid var(--accent-primary)' : 'none', borderRadius: '0.5rem' }}>
              <div
                className="h-12 w-12 rounded-lg shadow-sm ring-1 ring-white/10"
                style={{ backgroundColor: displayHex }}
              />
              {/* Modified indicator */}
              {modified && (
                <div
                  className="absolute -right-1 -top-1 h-3 w-3 rounded-full"
                  style={{ backgroundColor: 'var(--accent-primary)', border: '2px solid var(--bg-primary)' }}
                />
              )}
            </button>

            {/* Hex label */}
            <span className="mt-1 font-mono text-[10px]" style={{ color: 'var(--text-secondary)' }}>
              {displayHex}
            </span>

            {/* CSS variable name */}
            {color.cssVariable && (
              <span
                className="max-w-[56px] truncate text-[9px]"
                style={{ color: 'var(--text-muted)' }}>
                {color.cssVariable}
              </span>
            )}

            {/* Reset button for modified colors */}
            {modified && (
              <button
                type="button"
                onClick={() => onResetOverride(tokenId)}
                className="mt-0.5 text-[9px]"
                style={{ color: 'var(--status-error)' }}>
                Reset
              </button>
            )}

            {/* Hidden color picker input — shown when this swatch is active */}
            {activePickerHex === color.hex && (
              <input
                ref={pickerRef}
                type="color"
                value={displayHex}
                onChange={e => handleColorChange(color, e.target.value)}
                onBlur={() => setActivePickerHex(null)}
                className="invisible absolute"
              />
            )}
          </div>
        );
      })}
    </div>
  );
};

export { ColorEditor };
```

- [ ] **Step 2: Build and verify**

```bash
pnpm build
```

- [ ] **Step 3: Commit**

```bash
git commit -m "feat: add ColorEditor component with inline color picker"
```

---

### Task 17: Typography Editor Component

**Files:**
- Create: `pages/side-panel/src/components/TypographyEditor.tsx`

- [ ] **Step 1: Create typography editor**

Similar to `TypographyList` but with:
- Font family: an editable text input (user types a new font name)
- Font size: a number input with stepper
- Font weight: a `<select>` dropdown (300-700)
- Each change calls `onOverride` with the appropriate token override
- Modified entries show indicator + reset button
- Live preview text updates with the edited values

- [ ] **Step 2: Build and verify**

- [ ] **Step 3: Commit**

```bash
git commit -m "feat: add TypographyEditor component with font/size/weight editing"
```

---

### Task 18: Spacing Editor Component

**Files:**
- Create: `pages/side-panel/src/components/SpacingEditor.tsx`

- [ ] **Step 1: Create spacing editor**

Similar to `SpacingGrid` but with:
- Each value is an editable input (type a new px value)
- Proportional bar updates live
- Modified values show indicator + reset button
- Changes call `onOverride`

- [ ] **Step 2: Build and verify**

- [ ] **Step 3: Commit**

```bash
git commit -m "feat: add SpacingEditor component with editable values"
```

---

### Task 19: Override Toggle and SidePanel Integration

**Files:**
- Create: `pages/side-panel/src/components/OverrideToggle.tsx`
- Modify: `pages/side-panel/src/SidePanel.tsx`

- [ ] **Step 1: Create OverrideToggle component**

```tsx
// pages/side-panel/src/components/OverrideToggle.tsx
interface Props {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  hasOverrides: boolean;
}

const OverrideToggle = ({ enabled, onToggle, hasOverrides }: Props) => {
  if (!hasOverrides) return null;

  return (
    <button
      type="button"
      onClick={() => onToggle(!enabled)}
      className="flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors"
      style={{
        background: enabled ? 'var(--accent-10)' : 'transparent',
        border: `1px solid ${enabled ? 'var(--accent-primary)' : 'var(--border-default)'}`,
        color: enabled ? 'var(--accent-subtle)' : 'var(--text-muted)',
      }}>
      <span
        className="h-2 w-2 rounded-full"
        style={{ backgroundColor: enabled ? 'var(--accent-primary)' : 'var(--text-muted)' }}
      />
      {enabled ? 'Modified' : 'Original'}
    </button>
  );
};

export { OverrideToggle };
```

- [ ] **Step 2: Integrate into SidePanel**

Update `SidePanel.tsx`:
- Add `useOverrides` hook
- Add `OverrideToggle` to header (between title and buttons)
- Replace `ColorSwatches` with `ColorEditor` in the colors tab (pass overrides + handlers)
- Replace `TypographyList` with `TypographyEditor` in typography tab
- Replace `SpacingGrid` with `SpacingEditor` in spacing tab
- Keep `ComponentList` and `AnimationList` as read-only (per spec: v1)
- Wire `onOverride` and `onResetOverride` from the hook to the editor components

- [ ] **Step 3: Build and verify**

```bash
pnpm build
```

- [ ] **Step 4: Commit**

```bash
git commit -m "feat: integrate override toggle and editor components into SidePanel"
```

---

## Phase 5: Inspector

### Task 20: Content-UI Inspector Overlay

**Files:**
- Modify: `pages/content-ui/src/matches/all/App.tsx`
- Modify: `pages/content-ui/src/matches/all/index.tsx`

- [ ] **Step 1: Implement inspector overlay**

Replace the null-returning stub with an inspector overlay that:
- Listens for `ACTIVATE_INSPECTOR` / `DEACTIVATE_INSPECTOR` messages
- On activate: adds `mousemove` listener to highlight hovered elements
- Shows a tooltip with tag, class, and dimensions
- On click: sends `ELEMENT_SELECTED` message with the element's computed styles
- On deactivate: removes listeners, clears highlight

The overlay renders inside the existing Shadow DOM to avoid style collisions.

Key implementation:
- Highlight div: positioned absolutely, semi-transparent purple background
- Tooltip: positioned near cursor, shows element info
- Uses `document.elementFromPoint()` to identify hovered elements
- Reads all computed styles of clicked element and groups them

- [ ] **Step 2: Build and verify**

```bash
pnpm build
```

- [ ] **Step 3: Commit**

```bash
git commit -m "feat: add inspector overlay with hover highlight and element selection"
```

---

### Task 21: Element Detail View

**Files:**
- Create: `pages/side-panel/src/views/ElementDetailView.tsx`
- Modify: `pages/side-panel/src/SidePanel.tsx`

- [ ] **Step 1: Create ElementDetailView**

A view that shows:
- Element selector in header
- Grouped computed styles (Color, Typography, Spacing, Border, etc.)
- Each property is editable inline
- If a value matches a known token, shows "Change globally" / "Override element" choice
- Back button to return to extraction view

- [ ] **Step 2: Add inspector button and element detail view to SidePanel**

Add to the view state machine:
```typescript
type View =
  | { type: 'extract' }
  | { type: 'brandings' }
  | { type: 'detail'; branding: SavedBranding }
  | { type: 'element'; selector: string; styles: Record<string, string>; linkedTokens: Record<string, string> };
```

Add an "Inspect" button in the header that sends `ACTIVATE_INSPECTOR` to the content script.

Listen for `ELEMENT_SELECTED` messages from the content script and switch to the element view.

- [ ] **Step 3: Build and verify**

```bash
pnpm build
```

- [ ] **Step 4: Commit**

```bash
git commit -m "feat: add inspector element detail view with style editing"
```

---

## Phase 6: Export Upgrades

### Task 22: Session Export/Import

**Files:**
- Create: `packages/exporter/src/session.ts`
- Modify: `packages/exporter/index.mts`

- [ ] **Step 1: Implement session export and import**

```typescript
// packages/exporter/src/session.ts
import type { ExtractionResult, TokenOverride } from '@extension/extractor';

interface BrandingSessionFile {
  name: string;
  origin: string;
  version: 1;
  originalExtraction: ExtractionResult;
  overrides: TokenOverride[];
  screenshots?: {
    before?: string; // base64 PNG
    after?: string;
  };
  exportedAt: number;
}

const exportAsSession = (
  name: string,
  origin: string,
  extraction: ExtractionResult,
  overrides: TokenOverride[],
  screenshots?: { before?: string; after?: string },
): string =>
  JSON.stringify(
    {
      name,
      origin,
      version: 1,
      originalExtraction: extraction,
      overrides,
      screenshots,
      exportedAt: Date.now(),
    } satisfies BrandingSessionFile,
    null,
    2,
  );

const parseSessionFile = (json: string): BrandingSessionFile => {
  const parsed = JSON.parse(json) as BrandingSessionFile;
  if (!parsed.version || !parsed.originalExtraction || !parsed.origin) {
    throw new Error('Invalid branding session file');
  }
  return parsed;
};

export type { BrandingSessionFile };
export { exportAsSession, parseSessionFile };
```

- [ ] **Step 2: Update index.mts**

```typescript
export * from './src/session.js';
```

- [ ] **Step 3: Build and verify**

- [ ] **Step 4: Commit**

```bash
git commit -m "feat: add .branding.json session export and import"
```

---

### Task 23: Modified Token Export

**Files:**
- Modify: `packages/exporter/src/tokens.ts`
- Modify: `packages/exporter/src/css.ts`
- Modify: `packages/exporter/src/tailwind.ts`

- [ ] **Step 1: Update all three exporters to accept optional overrides**

Each exporter gets an optional second parameter `overrides?: TokenOverride[]`. When provided, the exported values reflect the merged result (original + overrides applied).

```typescript
// Example for tokens.ts
import type { ExtractionResult, TokenOverride } from '@extension/extractor';

const exportAsTokens = (result: ExtractionResult, overrides?: TokenOverride[]): string => {
  const overrideMap = new Map<string, string>();
  if (overrides) {
    overrides.forEach(o => overrideMap.set(o.tokenId, o.modifiedValue));
  }

  // When building color entries, check if this color's token has an override
  const getColorValue = (c: { hex: string; cssVariable?: string }): string => {
    const tokenId = c.cssVariable || `color-${c.hex.slice(1)}`;
    return overrideMap.get(tokenId) || c.hex;
  };

  // ... apply same pattern for typography and spacing
};
```

Apply the same pattern to `css.ts` and `tailwind.ts`.

- [ ] **Step 2: Build and verify**

- [ ] **Step 3: Commit**

```bash
git commit -m "feat: update exporters to support modified token values"
```

---

### Task 24: Export Modal Updates

**Files:**
- Modify: `pages/side-panel/src/components/ExportModal.tsx`
- Modify: `pages/side-panel/src/views/BrandingsView.tsx`

- [ ] **Step 1: Add fourth tab to ExportModal**

Add "Session (.branding.json)" tab that uses `exportAsSession`.

Add an "Original / Modified" toggle at the top when overrides exist.

- [ ] **Step 2: Add import button to BrandingsView**

Add an "Import" button that opens a file picker for `.branding.json` files. On import, parse with `parseSessionFile` and create a new saved branding.

- [ ] **Step 3: Build and verify**

- [ ] **Step 4: Commit**

```bash
git commit -m "feat: add session export tab and import functionality"
```

---

## Phase 7: Screenshots

### Task 25: Full-Page Screenshot Capture

**Files:**
- Create: `packages/extractor/src/screenshot.ts`
- Modify: `packages/extractor/index.mts`

- [ ] **Step 1: Implement screenshot capture**

```typescript
// packages/extractor/src/screenshot.ts

/**
 * Capture a full-page screenshot by scrolling through the page and stitching
 * viewport captures together.
 *
 * Must be called from the content script context. Uses chrome.runtime.sendMessage
 * to request captureVisibleTab from the background worker.
 */
const captureFullPage = async (): Promise<string> => {
  const totalHeight = document.documentElement.scrollHeight;
  const viewportHeight = window.innerHeight;
  const viewportWidth = window.innerWidth;
  const dpr = window.devicePixelRatio || 1;
  const originalScroll = window.scrollY;

  const captures: { y: number; dataUrl: string }[] = [];
  let currentY = 0;

  while (currentY < totalHeight) {
    window.scrollTo(0, currentY);
    // Wait for rendering to settle
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    const dataUrl: string = await new Promise(resolve => {
      chrome.runtime.sendMessage({ type: 'CAPTURE_VISIBLE_TAB' }, (response: { dataUrl: string }) => {
        resolve(response.dataUrl);
      });
    });

    captures.push({ y: currentY, dataUrl });
    currentY += viewportHeight;
  }

  // Restore scroll position
  window.scrollTo(0, originalScroll);

  // Stitch captures into one image
  const canvas = new OffscreenCanvas(viewportWidth * dpr, totalHeight * dpr);
  const ctx = canvas.getContext('2d')!;

  for (const capture of captures) {
    const img = await createImageBitmap(await (await fetch(capture.dataUrl)).blob());
    const drawHeight = Math.min(viewportHeight * dpr, totalHeight * dpr - capture.y * dpr);
    ctx.drawImage(img, 0, 0, img.width, drawHeight, 0, capture.y * dpr, img.width, drawHeight);
  }

  const blob = await canvas.convertToBlob({ type: 'image/png' });
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.readAsDataURL(blob);
  });
};

export { captureFullPage };
```

- [ ] **Step 2: Add background handler for captureVisibleTab**

In `chrome-extension/src/background/index.ts`:

```typescript
import 'webextension-polyfill';

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'CAPTURE_VISIBLE_TAB') {
    chrome.tabs.captureVisibleTab(undefined, { format: 'png' }, dataUrl => {
      sendResponse({ dataUrl });
    });
    return true; // async response
  }
});
```

- [ ] **Step 3: Build and verify**

- [ ] **Step 4: Commit**

```bash
git commit -m "feat: add full-page screenshot capture with viewport stitching"
```

---

### Task 26: Before/After Screenshot Integration

**Files:**
- Modify: `pages/side-panel/src/components/ExportModal.tsx`
- Modify: `pages/content/src/matches/all/index.ts`

- [ ] **Step 1: Add screenshot message handlers**

Add `CAPTURE_SCREENSHOT` message type to shared messages. The content script handles it by:
1. If overrides are active and "before" is requested: disable overrides, capture, re-enable
2. If "after" is requested: capture with overrides active

- [ ] **Step 2: Integrate into export flow**

When the user exports a session file, the ExportModal triggers both before/after captures and includes them in the `.branding.json`.

Add a "Capture Screenshots" button in the session export tab that shows progress.

- [ ] **Step 3: Build and verify**

- [ ] **Step 4: Commit**

```bash
git commit -m "feat: integrate before/after screenshots into session export"
```

---

### Task 27: Final Build and Verification

- [ ] **Step 1: Run all tests**

```bash
cd packages/extractor && pnpm test
```

Expected: All tests pass.

- [ ] **Step 2: Run full build**

```bash
pnpm build
```

Expected: All tasks successful.

- [ ] **Step 3: Run lint**

```bash
pnpm lint
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git commit -m "chore: final verification for live design editor"
```

---

## Summary

| Phase | Tasks | What it delivers |
|-------|-------|-----------------|
| 1. Extraction Foundation | 1-9 | Stylesheet scanning + parent-diff replaces inline-only extraction |
| 2. Override Engine | 10-12 | Injected `<style>` with live CSS overrides |
| 3. Persistence | 13-14 | Sessions with overrides stored per-origin |
| 4. Token Editor UI | 15-19 | Color pickers, font/size/weight editors, override toggle |
| 5. Inspector | 20-21 | Hover-highlight + click-to-select + element style editing |
| 6. Export Upgrades | 22-24 | Modified token export + `.branding.json` import/export |
| 7. Screenshots | 25-26 | Full-page before/after capture |

**Total Tasks:** 27
**Key Milestones:**
1. After Phase 1-2: Extraction works on real websites + override engine functional
2. After Phase 3-4: Users can edit tokens and see live changes
3. After Phase 5: Inspector provides element-level editing
4. After Phase 6-7: Full export pipeline with screenshots
