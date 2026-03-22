# APA Coworker

Chrome extension (MV3) for visual issue reporting on Shopify storefronts.

## Build & dev

```bash
pnpm install
pnpm dev          # development build with HMR
pnpm build        # production build to dist/
```

Load `dist/` as unpacked extension in `chrome://extensions`.

## Architecture

Monorepo using pnpm workspaces + Turborepo. Key areas:

- **`chrome-extension/`** — Manifest (`manifest.ts`), background service worker, build config
- **`pages/popup/`** — Extension popup with inline settings (no separate options page)
- **`pages/content-ui/`** — Injected UI: screenshot overlay, annotation canvas, issue form, issues panel (all rendered in Shadow DOM)
- **`pages/content/`** — Content script for DOM inspection (HTML snippet extraction)
- **`packages/shared/`** — Shared TypeScript types (`messages.ts`) and utilities

## Message flow

Popup/content-ui communicate with the background service worker via `chrome.runtime.sendMessage`. Message types are defined in `packages/shared/lib/messages.ts`:

- `START_REPORT` — Captures screenshot, sends to content-ui
- `CREATE_ISSUE` — Uploads screenshot to GitHub Release Assets, creates issue
- `FETCH_PAGE_ISSUES` — Fetches issues matching current page URL
- `SHOW_ISSUES_PANEL` — Relays issue data from popup to content-ui panel
- `GET_HTML_SNIPPET` — Extracts HTML from content script

## Screenshot storage

Screenshots are uploaded as GitHub Release Assets on a dedicated `visual-issues` release (not committed to repo). The background script resolves release asset URLs to signed CDN URLs for cross-origin `<img>` display.

## Conventions

- Settings (GitHub PAT, repos) stored in `chrome.storage.sync`
- Content-ui uses Shadow DOM with `delegatesFocus: true`
- Issue body format: Screenshot > Description > Details (environment, template, viewport, region)
- Issue titles prefixed with `[Visual]`
- Labels: `visual-issue`, `from-extension`
- Recently created issues are cached in-memory in the background script for optimistic display

## Claude analysis

Issues include an "Analysis" section prompting users to tag `@claude` in a comment. Claude then analyzes the issue against the target repo's codebase and posts an implementation plan. The extension detects the `analyzed` label and shows a badge in the issues panel and popup.
