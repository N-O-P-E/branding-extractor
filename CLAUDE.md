# CLAUDE.md

## Project overview

Branding Extractor is a Chrome MV3 extension that extracts design systems from websites. It inspects live pages to pull out color palettes, typography, spacing tokens, and other branding assets, then presents them in a clean side panel for designers and developers to review and export.

Built by [Studio N.O.P.E.](https://studionope.nl) — [@tijsluitse](https://github.com/tijsluitse) and [@basfijneman](https://github.com/basfijneman).

## Architecture

- **Monorepo** managed with pnpm workspaces and Turborepo
- **Chrome MV3** extension with service worker, side panel, content scripts, and content-UI overlay
- **React 18** for the side panel and content-UI overlay
- **Vite** for building all packages
- **TypeScript** throughout

### Key packages

| Path | Purpose |
|------|---------|
| `chrome-extension/` | Manifest, background service worker, static assets (icons) |
| `pages/side-panel/` | Side panel React app — displays extracted design tokens, color palettes, typography, and export controls |
| `pages/content-ui/` | Content-UI overlay — visual inspection overlay for element picking (Phase 3) |
| `pages/content/` | Content script — DOM inspection, HTML snippet extraction |
| `packages/shared/` | Shared types (`messages.ts`), utility functions |

### Message flow

The extension uses `chrome.runtime.sendMessage` for communication between contexts:

- **Side panel** -> **Content script**: `EXTRACT_STYLES` triggers full design-token extraction from the active tab's DOM
- The content script responds with an `ExtractStylesResponse` containing colors, typography, spacing, components, and animations

### Design token extraction

The extraction pipeline:
1. Content script walks the DOM and collects computed styles
2. Color values are deduplicated and grouped into a palette
3. Font families, sizes, weights, and line-heights are catalogued
4. Spacing and sizing values are analysed for a token grid
5. Results are sent to the side panel for display and export

## Development commands

```bash
pnpm dev           # dev build with HMR
pnpm build         # production build
pnpm zip           # build + zip for distribution
pnpm lint          # eslint across all workspaces
pnpm format        # prettier
pnpm type-check    # tsc --noEmit across all workspaces
```

## Build & test

```bash
pnpm build         # must pass before committing
pnpm lint          # must have 0 errors (warnings OK)
```

Load `dist/` as unpacked extension in `chrome://extensions` (Developer mode).

## Code style

- **Prettier** and **ESLint** enforced via pre-commit hooks (husky + lint-staged)
- Use CSS custom properties (`var(--bg-primary)`) for colors in side panel components
- Content-UI uses inline styles (runs in Shadow DOM, no CSS variable access from page)
- Prefer `chrome.runtime.sendMessage` over direct function calls between contexts

## Key patterns

- **Element inspection**: Content script uses `document.elementFromPoint` to identify hovered elements and extract their HTML and computed styles.
- **Shadow DOM isolation**: Content-UI overlay is mounted inside a Shadow DOM root to avoid style collisions with the host page.
- **Manifest permissions**: Only the minimum set of permissions is requested — `activeTab`, `storage`, `sidePanel`, and `host_permissions: <all_urls>`.

## Permissions explained

| Permission | Why |
|-----------|-----|
| `activeTab` | Access current tab for content script injection |
| `tabs` | Query active tab to send extraction messages to content script |
| `storage` | Store user preferences and extracted token sets |
| `sidePanel` | Chrome side panel API |
| `host_permissions: <all_urls>` | Inject content scripts on any page to extract styles |
