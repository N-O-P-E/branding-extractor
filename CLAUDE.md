# CLAUDE.md

## Project overview

Visual Issue Reporter is a Chrome MV3 extension that lets anyone report visual issues directly to GitHub. It captures annotated screenshots, records screen videos with mic narration, and creates issues with full browser context.

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
| `chrome-extension/` | Manifest, background service worker, static assets (icons, mic-permission page) |
| `pages/side-panel/` | Side panel React app — repo selector, issue form, settings, recording controls |
| `pages/content-ui/` | Content-UI overlay — screenshot canvas, drawing tools, recording overlay, inspect mode |
| `pages/content/` | Content script — DOM inspection, main-world script injection |
| `packages/shared/` | Shared types (`messages.ts`), browser metadata, console capture, Shopify detection |

### Message flow

The extension uses `chrome.runtime.sendMessage` for communication between contexts:

- **Side panel** <-> **Background**: `CREATE_ISSUE`, `ACTIVATE_TOOL`, `START_RECORDING`, `FETCH_PAGE_ISSUES`, etc.
- **Background** <-> **Content script**: `SHOW_SCREENSHOT`, `DISMISS_OVERLAY`, `GET_HTML_SNIPPET`
- **Content-UI** -> **Side panel**: `CAPTURE_COMPLETE`, `TOOL_SWITCHED`, `BROWSER_METADATA`

### Screen recording architecture

Recording runs entirely in the side panel (not offscreen document):
1. Side panel calls `getDisplayMedia()` — Chrome shows the tab picker
2. `MediaRecorder` captures the stream in the side panel
3. Optional mic audio mixed via `AudioContext`
4. On stop, video blob is uploaded directly via GitHub's user-attachments API (using `declarativeNetRequest` for cookie injection) or falls back to release assets
5. Only the resulting video URL is passed to the background for issue creation

### Video upload (user-attachments)

To get inline video embeds in GitHub issues, the extension uses GitHub's internal upload API:
1. `chrome.cookies.getAll({ url: 'https://github.com' })` gets session cookies
2. `declarativeNetRequest` session rules inject `Cookie`, `Origin`, `Referer` headers (forbidden in `fetch()`)
3. Three-step flow: get upload policy -> upload to S3 -> confirm
4. Returns `github.com/user-attachments/assets/` URL that GitHub renders as inline video

### Theming

Themes are defined in `pages/side-panel/src/useTheme.ts` and applied via CSS custom properties in `pages/side-panel/src/index.css`. The content-UI overlay reads theme from storage and applies matching styles.

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
- Use `fetch()` instead of Octokit for simple GET/existence checks (avoids noisy 404 errors in service worker)

## Key patterns

- **Recording overlay**: Content-UI has a `recordingMode` state that activates a transparent overlay with `pointer-events: none` (pointer mode) or `auto` (draw mode). Strokes stored with document-relative coordinates for scroll persistence.
- **Permission prompts**: Side panel can't show `getUserMedia` prompts. Mic permission is requested via a helper tab (`mic-permission.html`).
- **GitHub cookies**: `declarativeNetRequest` session rules inject headers at the network layer — `fetch()` silently strips `Cookie`, `Origin`, `Referer` even in service workers.

## Permissions explained

| Permission | Why |
|-----------|-----|
| `activeTab` | Access current tab for screenshots and content script injection |
| `storage` | Store GitHub PAT, selected repo, theme, settings |
| `sidePanel` | Chrome side panel API |
| `cookies` | Read GitHub session cookies for user-attachments video upload |
| `declarativeNetRequest` | Inject Cookie/Origin/Referer headers that `fetch()` strips |
| `host_permissions: <all_urls>` | Inject content scripts and capture screenshots on any page |
