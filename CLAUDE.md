# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Coworker — Chrome extension (MV3) for visual issue reporting. Distributed via Chrome Web Store under Studio Nope.

## Build & dev

```bash
pnpm install          # install dependencies (pnpm 10.11, node 22.15)
pnpm dev              # development build with HMR → dist/
pnpm build            # production build → dist/
pnpm zip              # build + create distribution ZIP
pnpm lint             # eslint
pnpm lint:fix         # eslint --fix
pnpm format           # prettier
pnpm type-check       # tsc across all workspaces
pnpm e2e              # webdriverio e2e tests (builds zip first)
pnpm update-version   # bump version across all workspace packages
```

Load `dist/` as unpacked extension in `chrome://extensions` (enable Developer mode).

## Architecture

Monorepo: pnpm workspaces + Turborepo (concurrency: 12, TUI mode).

### Extension components

| Component | Location | Runs in | Format |
|-----------|----------|---------|--------|
| Background service worker | `chrome-extension/src/background/index.ts` | Extension process | ES module |
| Popup | `pages/popup/src/Popup.tsx` | Extension popup | SPA (Vite + React) |
| Content-UI | `pages/content-ui/src/matches/all/App.tsx` | Page (Shadow DOM) | IIFE bundle |
| Content script | `pages/content/src/matches/all/index.ts` | Page (isolated world) | IIFE bundle |

### Shared packages

- **`packages/shared/`** — Message types (`lib/messages.ts`), Shadow DOM init (`lib/utils/init-app-with-shadow.ts`), utilities
- **`packages/vite-config/`** — `withPageConfig()` shared Vite setup for pages
- **`packages/hmr/`** — WebSocket-based HMR for dev (watchPublicPlugin, watchRebuildPlugin, makeEntryPointPlugin)
- **`packages/env/`** — `IS_DEV`/`IS_PROD` flags via dotenvx
- **`packages/ui/`** — Tailwind utilities, `withUI()` helper

## Message flow

All inter-component communication uses `chrome.runtime.sendMessage`. Types defined in `packages/shared/lib/messages.ts`:

```
Popup → Background: START_REPORT
Background → Content-UI: SHOW_SCREENSHOT (with captureVisibleTab data URL)
Content-UI → Content: GET_HTML_SNIPPET (elementFromPoint extraction)
Content-UI → Background: CREATE_ISSUE (screenshot + annotation + metadata)
Background → GitHub API: upload release asset + create issue
Popup → Background: FETCH_PAGE_ISSUES → SHOW_ISSUES_PANEL → Content-UI
```

## Shadow DOM isolation

Content-UI renders inside Shadow DOM (`delegatesFocus: true`, z-index max). Keyboard events are intercepted at capture phase and re-dispatched as non-composed clones to prevent leaking to host page. Styles injected via `adoptedStyleSheets` (Chrome) or `<style>` tags (Firefox).

## Conventions

- Manifest permissions: `activeTab`, `storage`, host: `<all_urls>`
- Settings stored in `chrome.storage.sync`: `githubPat`, `selectedRepo`, `repoList`
- Issue titles: `[Visual] <description>`, labels: `visual-issue`, `from-extension`
- Screenshots uploaded as GitHub Release Assets on `visual-issues` release tag
- Issues include Analysis section for `@claude` tagging; `analyzed` label triggers badge
- Tailwind class ordering via prettier-plugin-tailwindcss
- TypeScript strict mode, `prefer-const`, consistent-type-imports
- Import order: external → @extension/* → builtins

## Chrome Extension reference

When working on extension features, consult these official docs:

- **Manifest V3**: https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3
- **Content Scripts**: https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts
- **Message Passing**: https://developer.chrome.com/docs/extensions/develop/concepts/messaging
- **Service Workers**: https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/events
- **Permissions**: https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions
- **chrome.tabs API**: https://developer.chrome.com/docs/extensions/reference/api/tabs
- **chrome.storage API**: https://developer.chrome.com/docs/extensions/reference/api/storage
- **chrome.runtime API**: https://developer.chrome.com/docs/extensions/reference/api/runtime
- **Chrome Web Store publishing**: https://developer.chrome.com/docs/webstore/publish/
- **CWS review process**: https://developer.chrome.com/docs/webstore/review-process
- **CWS policies**: https://developer.chrome.com/docs/webstore/program-policies/policies

Key constraints: `captureVisibleTab` rate limited to 2 calls/sec. `storage.sync` max 100KB total, 8KB per item. Message max 64 MiB JSON. Service worker event handlers must be at global scope. Always validate messages from content scripts.
