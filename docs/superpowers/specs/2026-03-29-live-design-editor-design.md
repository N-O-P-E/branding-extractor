# Live Design System Editor — Design Spec

**Date:** 2026-03-29
**Status:** Approved
**Goal:** Transform Branding Extractor from a read-only extraction tool into a live design system editor. Users extract a site's styles, modify tokens (colors, fonts, spacing), see changes live on the page, and export the modified design system.

---

## 1. Extraction Upgrade

### Problem

Current extractors only read inline `style="..."` attributes. Real websites apply 95%+ of styles via `<style>` tags and `<link>` stylesheets. The extractor produces near-empty results on most production sites.

### Solution: Two-Pass Extraction

**Pass 1 — CSS Variable Scan**

Walk `document.styleSheets` and parse all CSS custom property declarations. This gives us the site's design tokens directly:

```css
:root {
  --color-primary: #3b82f6;    /* → token: color-primary = #3b82f6 */
  --font-heading: 'Inter';     /* → token: font-heading = Inter    */
  --spacing-lg: 24px;          /* → token: spacing-lg = 24px       */
}
```

Cross-origin stylesheets throw `SecurityError` when accessed via the CSSOM. Handling strategy:
- Catch the error per-stylesheet and skip gracefully.
- For same-origin stylesheets: full rule access.
- For cross-origin `<link>` stylesheets: attempt `fetch()` of the URL (same-origin policy permitting) and parse the response text with the same regex approach used for `<style>` elements.

**Pass 2 — Computed Style with Parent-Diff**

For every element, compare its `getComputedStyle` to its parent's `getComputedStyle`. If a property value differs, something targeted that element (a stylesheet rule, a class, or an inline style). This catches all CSS-applied styles while filtering pure inheritance.

```
<body>                       → color: black (base)
  <div>                      → color: black (inherited, skip)
    <h1 class="title">       → color: #1a1a1a (differs from parent → extract)
      <span>                 → color: #1a1a1a (inherited, skip)
```

**Token linkage:** When a computed color matches a known CSS variable value from Pass 1, link them. This is what makes token-level editing powerful — change the variable and all elements referencing it update.

### Codebase Changes

- New: `packages/extractor/src/stylesheet-scanner.ts` — walks `document.styleSheets`, extracts CSS variables, builds selector-to-value mappings.
- Modified: All 5 extractors (colors, typography, spacing, components, animations) — replace inline-only guard (`if (!inlineValue) return`) with parent-diff approach.
- Updated: Tests with stylesheet-based test cases.

---

## 2. Override/Injection Engine

### Core Mechanism

A single `<style id="branding-extractor-overrides">` element injected into the page by the content script. All live edits write into this one stylesheet.

### Three Levels of Override (Priority Order)

**Level 1 — CSS Variable Overrides** (most powerful)

When a site uses CSS custom properties, override at `:root` with `!important`:

```css
:root {
  --color-primary: #e11d48 !important;
  --font-heading: 'Playfair Display' !important;
}
```

One line changes every element referencing that variable.

**Level 2 — Token-Mapped Overrides** (for sites without CSS variables)

When extraction found 47 elements using `color: #3b82f6` but no CSS variable for it, generate targeted rules using the selectors discovered during extraction:

```css
/* Auto-generated: token color-#3b82f6 → #e11d48 */
h1.title, .nav-link, .btn-primary { color: #e11d48 !important; }
```

**Level 3 — Element-Specific Overrides** (from the inspector)

Individual element changes from the inspect tool:

```css
/* Inspector override */
.hero-section > h2.subtitle { font-size: 18px !important; }
```

### Toggle Behavior

The toggle does not delete the override stylesheet. It sets `stylesheet.disabled = true/false`. One attribute flip and the page snaps between original and modified instantly.

### Message Protocol

| Message               | Direction             | Payload                          |
|-----------------------|-----------------------|----------------------------------|
| `APPLY_OVERRIDE`      | Side panel → Content  | `{ token, value }`              |
| `REMOVE_OVERRIDE`     | Side panel → Content  | `{ token }`                     |
| `CLEAR_ALL_OVERRIDES` | Side panel → Content  | —                                |
| `SET_OVERRIDES_ENABLED` | Side panel → Content | `{ enabled: boolean }`          |
| `GET_OVERRIDE_STATE`  | Side panel → Content  | — (returns current overrides)    |

### Codebase Changes

- New: `packages/extractor/src/override-engine.ts` — manages injected stylesheet, builds CSS rules from token edits.
- Modified: Content script gains override message handlers.
- The override engine requires the extraction result to map token values to selectors (for Level 2 overrides).

---

## 3. Token Editor UI

### Header Changes

Current: `[Extract] [Export] [Saved]`
New: `[Extract] [Toggle: Original/Modified] [Export] [Saved]`

The toggle is a pill switch that flips the override stylesheet on/off. Only appears after at least one edit. A dot indicator shows when modifications are active.

### Per-Tab Editing

**Colors tab:**
- Each swatch opens a color picker (`<input type="color">` popover) on click.
- Pick a new color → token updates live on the page.
- Modified swatches get a subtle ring indicator + reset-to-original icon.
- CSS variable name shown as label when available.

**Typography tab:**
- Font family: dropdown populated with common web fonts (+ Google Fonts API integration for a broader selection).
- Font size: editable input with stepper arrows.
- Font weight: dropdown (300, 400, 500, 600, 700).
- Live preview text in the side panel updates alongside the page.
- Modified entries get indicator + reset button.

**Spacing tab:**
- Each value becomes an editable input (type the value or use drag to adjust).
- Proportional bar visualization updates live.

**Components tab:**
- Read-only for v1. Showing detected patterns is already useful.

**Animations tab:**
- Read-only for v1. Could allow duration/timing tweaks in a future version.

### Modified State Tracking

```typescript
interface TokenOverride {
  tokenId: string;         // e.g., '--color-primary' or 'color-#3b82f6'
  originalValue: string;   // '#3b82f6'
  modifiedValue: string;   // '#e11d48'
  type: 'cssVariable' | 'computed';  // determines override strategy
  selectors?: string[];    // for Level 2 overrides (non-variable tokens)
}
```

The side panel holds a `Map<string, TokenOverride>` as React state. Every edit creates or updates an entry. Auto-saves to Chrome storage on every change.

---

## 4. Element Inspector

### Reuse from VIR

The original Visual Issue Reporter had a full inspect mode in `pages/content-ui/` — hover highlights, click to select, shows tag/class/dimensions. The content-ui infrastructure (Shadow DOM mount, IIFE build) is still in place.

### Activation

An "Inspect" button in the side panel header. Click → content-ui overlay activates → cursor changes to crosshair.

### Hover State

As the cursor moves over the page, elements highlight with a semi-transparent purple overlay (`--accent-primary` at 20% opacity) and a tooltip showing tag, class name, and dimensions.

### Click to Select

Click an element → side panel switches to an "Element Detail" view showing:
- The element's selector (e.g., `h2.hero-title`).
- All computed style properties, grouped by category (color, typography, spacing, border, etc.).
- Each property is editable inline.
- If a property value matches a known token, the panel shows the token name and offers a choice: **"Change token globally"** (Level 1/2 override) vs **"Override just this element"** (Level 3 override).

### Message Flow

```
User hovers element on page
  → Content-UI renders highlight overlay
User clicks element
  → Content script reads computed styles + matched CSS rules
  → Sends ELEMENT_SELECTED { selector, computedStyles, linkedTokens } to side panel
  → Side panel shows Element Detail view
User edits a property
  → Side panel sends APPLY_OVERRIDE to content script
  → Override engine injects/updates the CSS rule
  → Page updates live
```

---

## 5. Persistence & Toggle

### Storage Model

```typescript
interface BrandingSession {
  id: string;
  name: string;
  origin: string;              // e.g., 'https://stripe.com'
  originalExtraction: ExtractionResult;
  overrides: TokenOverride[];  // modifications
  enabled: boolean;            // toggle state
  createdAt: number;
  updatedAt: number;
}
```

Keyed by `origin` — all pages on `stripe.com` share the same session.

### Lifecycle

1. **Extract** — Click Extract on `stripe.com/pricing`. Extraction stored as a new session.
2. **Edit** — Change `--color-primary` to red. Override added to session and auto-saved to `chrome.storage.local` immediately.
3. **Navigate** — Click to `stripe.com/features`. Content script fires on page load, checks storage for an active session matching this origin, finds one with `enabled: true`, injects override stylesheet. Page loads with modified branding already applied.
4. **Toggle off** — Click the toggle. Override stylesheet gets `disabled = true`. Page snaps to original. Session stays in storage with `enabled: false`.
5. **Toggle on** — Flip back. Overrides reappear instantly.
6. **Done** — Export modified tokens and/or session file. Delete session when finished, or keep it for later.

### Content Script Initialization

On every page load:
1. Check `chrome.storage.local` for a session matching `window.location.origin`.
2. If found and `enabled === true` → inject override stylesheet with stored overrides.
3. Send `ACTIVE_SESSION` message to side panel so it shows the correct state.

### Multiple Sessions

Sessions for different sites coexist. Each only activates on its matching origin.

### Relationship to Saved Brandings

The existing saved brandings feature merges with sessions. A saved branding gains an `overrides` array and an `enabled` toggle. One storage concept, not two separate systems.

---

## 6. Export

### Modified Token Export

The three existing formats (JSON tokens, CSS variables, Tailwind config) export the *merged* result — original values with overrides applied:

```css
:root {
  --color-primary: #e11d48;   /* modified */
  --color-secondary: #0f172a; /* untouched original */
}
```

Clean, final values — no concept of "original vs override." This is what a developer takes and implements.

### Branding Session Export (`.branding.json`)

Full round-trip format for backup, sharing, and import:

```json
{
  "name": "Stripe Rebrand",
  "origin": "https://stripe.com",
  "version": 1,
  "originalExtraction": { },
  "overrides": [
    { "tokenId": "--color-primary", "originalValue": "#635bff", "modifiedValue": "#e11d48", "type": "cssVariable" },
    { "tokenId": "--font-heading", "originalValue": "Inter", "modifiedValue": "Playfair Display", "type": "cssVariable" }
  ],
  "screenshots": {
    "before": "<base64 PNG or external file reference>",
    "after": "<base64 PNG or external file reference>"
  },
  "exportedAt": 1711670400000
}
```

### Import

"Import" button in the Saved Brandings view. Accepts `.branding.json` via file picker or drag-and-drop. On import: session created in storage. If the user is on the matching origin, overrides apply immediately.

### Export Modal Changes

- Fourth tab: **"Session (.branding.json)"** with JSON preview and download.
- Toggle at top: **"Export original values" / "Export with modifications"**. Defaults to modifications when overrides exist.

---

## 7. Full-Page Screenshots

### Capture Method

Full-page screenshots captured by scrolling through the page and stitching viewport captures using `chrome.tabs.captureVisibleTab()`.

Process:
1. Record the current scroll position.
2. Calculate total page height (`document.documentElement.scrollHeight`) and viewport height.
3. For each scroll increment: scroll → wait for render → `captureVisibleTab()` → store the image data.
4. Stitch all captures into a single image using OffscreenCanvas.
5. Restore original scroll position.

### Two Screenshots Per Export

- **Before:** Toggle overrides off → capture full page → toggle overrides back on.
- **After:** Capture full page with overrides active.

Both are included in the `.branding.json` export (as base64 data URIs or as separate PNG files for manual download).

### When Screenshots Are Taken

- **On Export:** Both before and after captured at export time.
- **On Save:** Just the "after" screenshot as a thumbnail for the saved brandings list.

### Permission

`chrome.tabs.captureVisibleTab()` requires the `activeTab` permission, which is already declared in the manifest.

---

## Summary

| Section | Purpose |
|---------|---------|
| 1. Extraction | Parent-diff + stylesheet scanning replaces inline-only extraction |
| 2. Override Engine | Injected `<style>` element with 3 priority levels for live editing |
| 3. Token Editor | Color pickers, font dropdowns, spacing inputs in the side panel |
| 4. Inspector | VIR-style hover/click inspect for individual element editing |
| 5. Persistence | Sessions stored by origin, survive navigation, toggleable on/off |
| 6. Export | Modified tokens + importable `.branding.json` with full round-trip |
| 7. Screenshots | Full-page before/after captures included with exports |
