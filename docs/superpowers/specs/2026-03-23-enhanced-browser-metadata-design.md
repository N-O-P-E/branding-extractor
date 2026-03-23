# Enhanced Browser Metadata & Shopify Context for Issue Reports

**Date:** 2026-03-23
**Status:** Approved

## Problem

Issue reports currently capture minimal context (viewport size, page URL, environment type, HTML snippet). Developers using LLMs like Claude Code to fix reported issues need comprehensive browser, device, and platform context to diagnose and fix problems without follow-up questions. Console errors — often the most direct clue — are not captured at all.

Additionally, when reporting from Shopify pages, there's no structured Shopify-specific context (store, theme, locale) and no direct links to reproduce the issue in the theme editor or preview.

## Design

### 1. BrowserMetadata Interface

New shared type in `packages/shared/lib/messages.ts`:

```typescript
interface BrowserMetadata {
  browser: { name: string; version: string; engine: string };
  os: { name: string; version: string; platform: string };
  device: {
    type: 'desktop' | 'tablet' | 'mobile';
    screenWidth: number;
    screenHeight: number;
    pixelRatio: number;
    colorScheme: 'dark' | 'light' | 'no-preference';
  };
  page: { title: string; language: string; zoomLevel: number };
  network: { online: boolean; connectionType?: string };
  consoleErrors: Array<{ level: 'error' | 'warn'; message: string; timestamp: number }>;
  userAgent: string;
  shopify?: ShopifyContext;
}

interface ShopifyContext {
  storeName: string;
  storeHandle: string;
  themeName?: string;
  themeId?: string;
  environment: 'editor' | 'preview' | 'live' | 'local';
  buildVersion?: string;
  locale?: string;
  editorUrl?: string;
  previewUrl?: string;
}
```

### 2. Collection Utility

New file: `packages/shared/lib/utils/browser-metadata.ts`

Single function `collectBrowserMetadata(): BrowserMetadata` that gathers all data at capture time. The content-UI shares the page's `window` and `document` objects, so most metadata (`navigator.userAgent`, `window.innerWidth`, `matchMedia`, `navigator.onLine`, etc.) is directly accessible. DOM queries like `document.querySelector('script[data-serialized-id="server-data"]')` query the host page document, not the shadow root.

**Browser/OS parsing:** Prefer `navigator.userAgentData` (available in Chrome) for structured brand/version/platform info. Fall back to parsing `navigator.userAgent` string for Firefox/Safari. Use `navigator.userAgentData?.mobile` as the primary mobile detection signal. Keep the parser minimal — cover Chrome, Firefox, Safari, Edge. Fall back to "Unknown" for unrecognized agents.

**Device type inference:**
- Primary signal: `navigator.userAgentData?.mobile` (reliable in Chrome)
- Fallback heuristic: `mobile` if viewport width <= 768; `tablet` if viewport 769-1024 AND `navigator.maxTouchPoints > 0`; `desktop` otherwise
- Note: touch-capable laptops (Surface, touchscreen Chromebooks) may be misclassified by the fallback heuristic. This is best-effort.

**Zoom level:** `Math.round((window.visualViewport?.scale ?? 1) * 100)` (percentage). Prefer `visualViewport.scale` over `outerWidth/innerWidth` because the latter is unreliable when the side panel or dev tools are open.

**Color scheme:** `window.matchMedia('(prefers-color-scheme: dark)').matches`

**Network:** `navigator.onLine` + `(navigator as any).connection?.effectiveType`

**Console error capture:** Requires main-world script injection because Chrome content scripts run in an isolated JavaScript context — they share the DOM but have a separate `window`/`console` object. The host page's `console.error`/`console.warn` calls are invisible to content scripts.

Architecture:
1. The content script (`pages/content/src/matches/all/index.ts`) injects a small inline `<script>` into the page's main world on load
2. This injected script monkey-patches `console.error` and `console.warn`, storing entries in a module-level array (FIFO, capped at 50 entries, each message truncated to 500 chars via `.slice(0, 500)`)
3. The original console methods are preserved and still called
4. When the content-UI needs the errors at capture time, it dispatches a custom DOM event (`coworker-request-console-errors`)
5. The injected main-world script listens for this event and responds with a `coworker-console-errors` event containing the captured array
6. The content-UI reads the response and includes it in `browserMetadata.consoleErrors`

Idempotency: The injected script checks a `window.__coworkerConsolePatched` flag before patching to avoid stacking wrappers on SPA navigations or remounts.

New file needed: `packages/shared/lib/utils/console-capture.ts` — the inline script source and the event-based retrieval helper.

**Shopify context extraction:**
1. Check if hostname matches Shopify patterns (`admin.shopify.com`, `*.myshopify.com`, or URL contains Shopify admin paths)
2. Try to parse `document.querySelector('script[data-serialized-id="server-data"]')` JSON for store data, build version, locale
3. Extract store name from `<title>` tag (pattern: `{StoreName} · Edit {themeName} · Shopify`)
4. Extract store handle from URL path segments or preload link hrefs
5. Extract theme ID from URL `preview_theme_id` param or editor URL pattern
6. Generate editor URL: `https://admin.shopify.com/store/{storeHandle}/themes/{themeId}/editor?template={template}`
7. Generate preview URL: `https://{storeHandle}.myshopify.com{pagePath}?preview_theme_id={themeId}`
8. If any extraction fails, omit the failed field — `shopify` is optional

### 3. Message Flow Changes

**`CAPTURE_COMPLETE` message** — add `browserMetadata: BrowserMetadata` to payload.

**`CREATE_ISSUE` message** — add `browserMetadata: BrowserMetadata` to payload.

Both are additions to existing interfaces. The content-UI calls `collectBrowserMetadata()` at the moment the user finalizes the capture (clicks "Done"), and includes it in the `CAPTURE_COMPLETE` message. The side panel passes it through to `CREATE_ISSUE`.

**Important:** There are two separate code paths in `App.tsx` that send `CAPTURE_COMPLETE` — one from the pencil/draw tool's "Done" handler and one from the select tool path. Both must include `browserMetadata`.

### 4. GitHub Issue Body Format

The background worker renders the metadata into the issue body. The existing section order is being intentionally changed — `## Links` is added as the first section (before Screenshot), and new sections are inserted after Details. The `ShopifyContext.environment` field replaces the existing `detectEnvironment()` logic in the background worker when Shopify context is present; for non-Shopify pages, the existing detection continues to be used.

Full template:

```markdown
## Links
- [Open in Theme Editor]({editorUrl})
- [Preview]({previewUrl})

## Screenshot
![Screenshot]({screenshotUrl})

## Description
{user description}

## Details
- **Page:** {pathname}
- **Store:** {hostname}
- **Environment:** {environment}
- **Template:** {template}
- **Theme ID:** {theme_id}
- **Viewport:** {viewportWidth} x {viewportHeight}
- **Region:** x:{x}, y:{y}, width:{width}, height:{height}

## Environment
- **Browser:** Chrome 126.0 (Blink)
- **OS:** macOS 15.3
- **Device:** desktop (2560x1440 @2x)
- **Viewport:** 1280x720
- **Zoom:** 100%
- **Color Scheme:** dark
- **Page Title:** My Store - Home
- **Language:** en
- **Connection:** online (4g)

## Shopify Context
- **Store:** Gormans (gormans-furnishings-design)
- **Theme:** apa-gormans/main
- **Theme ID:** 123456789
- **Environment:** editor
- **Shopify Build:** 17086.13c4d49b
- **Locale:** en-NL

## Console Errors
```
[error] 14:32:05 — Uncaught TypeError: Cannot read property 'foo' of undefined
[warn] 14:31:58 — Deprecation warning: ...
```

## HTML Snippet
```html
{html snippet}
```

## Analysis
> Tag `@claude` in a comment to analyze this issue against the codebase.

---
*Reported via Coworker by Studio N.O.P.E.*
```

**Conditional rendering:**
- "Links" section: only when Shopify context has `editorUrl` or `previewUrl`
- "Shopify Context" section: only when `shopify` is present
- "Console Errors" section: only when there are entries
- "Environment" section: always present

### 5. Side Panel UI

In `CreateIssueView.tsx`:

**Shopify links (prominent, above the form or between form and metadata):**
- Two styled link buttons: "Open in Theme Editor" and "Preview"
- Only shown when Shopify context is detected
- Visible and clickable, not hidden in an accordion

**Metadata accordion (below the form):**
- Collapsible section titled "Browser & Environment"
- Default state: collapsed
- Shows all metadata fields in a readable list format
- Includes Shopify Context subsection when applicable
- Includes Console Errors subsection when there are entries
- Purpose: transparency — users see exactly what metadata is being sent with the issue

### 6. Files Changed

| File | Change |
|------|--------|
| `packages/shared/lib/messages.ts` | Add `BrowserMetadata`, `ShopifyContext` interfaces; add field to `CaptureCompleteMessage` and `CreateIssueMessage` |
| `packages/shared/lib/utils/browser-metadata.ts` | **New file.** `collectBrowserMetadata()` utility (browser/OS parsing, device detection, Shopify extraction) |
| `packages/shared/lib/utils/console-capture.ts` | **New file.** Main-world console capture script source + event-based retrieval helper |
| `pages/content/src/matches/all/index.ts` | Inject main-world console capture script on page load |
| `pages/content-ui/src/matches/all/App.tsx` | Call `collectBrowserMetadata()` at capture time in both CAPTURE_COMPLETE code paths |
| `pages/side-panel/src/views/CreateIssueView.tsx` | Add Shopify link buttons + metadata accordion UI |
| `chrome-extension/src/background/index.ts` | Render new metadata sections in GitHub issue body; use Shopify context environment when available |

### 7. Edge Cases

- **Non-Shopify pages:** `shopify` field is undefined, Shopify-specific sections are omitted entirely
- **Shopify pages without theme editor:** If theme ID can't be extracted (e.g. live storefront without preview param), omit editor/preview URLs
- **Console capture isolation:** The console monkey-patch runs in the page's main world via injected `<script>`, communicating back via custom DOM events. This captures host page errors, not extension errors. The injected script is idempotent (checks `window.__coworkerConsolePatched` flag).
- **Message size:** Console errors capped at 50 entries, each message truncated to 500 chars via `.slice(0, 500)`. This keeps the payload well under Chrome's 64 MiB message limit.
- **SPA navigations:** The console capture script persists across SPA navigations (same page context). The idempotency flag prevents re-patching.
- **UA parsing failures:** All parser functions return sensible defaults ("Unknown") rather than throwing
