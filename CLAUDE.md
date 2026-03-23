# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Visual Issue Reporter — Chrome extension (MV3) for visual issue reporting on Shopify storefronts. Captures annotated screenshots and creates GitHub issues with full browser/Shopify context. Distributed via Chrome Web Store by Studio N.O.P.E.

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

Load `dist/` as unpacked extension in `chrome://extensions` (enable Developer mode). Side panel opens on extension icon click.

## Architecture

Monorepo: pnpm workspaces + Turborepo (concurrency: 12, TUI mode).

### Extension components

| Component | Location | Runs in | Format |
|-----------|----------|---------|--------|
| Background service worker | `chrome-extension/src/background/index.ts` | Extension process | ES module |
| Side panel | `pages/side-panel/src/SidePanel.tsx` | Extension side panel | SPA (Vite + React) |
| Content-UI | `pages/content-ui/src/matches/all/App.tsx` | Page (Shadow DOM) | IIFE bundle |
| Content script | `pages/content/src/matches/all/index.ts` | Page (isolated world) | IIFE bundle |
| Popup | `pages/popup/src/Popup.tsx` | Extension popup | SPA (Vite + React) |

### Side panel views

The side panel (`SidePanel.tsx`) manages three views:
- **HomeView** — repo selector, tool buttons (Select/Canvas/Inspect), page issues list, settings access
- **CreateIssueView** — description, label/assignee selectors, environment info, submit
- **SetupView** — GitHub PAT validation, searchable repo picker with sync

### Shared packages

- **`packages/shared/`** — Message types (`lib/messages.ts`), Shadow DOM init, browser metadata collection, console capture
- **`packages/vite-config/`** — `withPageConfig()` shared Vite setup for pages
- **`packages/hmr/`** — WebSocket-based HMR for dev
- **`packages/env/`** — `IS_DEV`/`IS_PROD` flags via dotenvx. Env vars prefixed `CEB_*` or `CLI_CEB_*`
- **`packages/ui/`** — Tailwind utilities, `withUI()` helper

## Message flow

All inter-component communication uses `chrome.runtime.sendMessage`. Types defined in `packages/shared/lib/messages.ts`:

```
Side Panel → Background: ACTIVATE_TOOL (select/pencil/inspect)
Background → Content-UI: SHOW_SCREENSHOT (with captureVisibleTab data URL + tool)
Content-UI → Content: GET_HTML_SNIPPET (elementFromPoint extraction)
Content-UI → Background: CAPTURE_COMPLETE (annotated screenshot + metadata)
Side Panel → Background: CREATE_ISSUE → GitHub API (upload release asset + create issue)
Side Panel → Background: FETCH_PAGE_ISSUES → SHOW_ISSUES_PANEL → Content-UI
Side Panel → Background: FETCH_LABELS / FETCH_ASSIGNEES / FETCH_REPOS
Content-UI → Side Panel: TOOL_SWITCHED (notifies tool change)
```

## Content-UI overlay system

Content-UI renders inside Shadow DOM (`delegatesFocus: true`, z-index max). Keyboard events intercepted at capture phase and re-dispatched as non-composed clones to prevent leaking to host page.

### Three tools

- **Select** — rectangular region selection with multiple colors
- **Canvas** — annotation with sub-tools: draw (8 colors, 3 widths), text (comment boxes), image (paste/drag-drop/file picker). Undo/redo support.
- **Inspect** — live element highlighting, DOM info display, HTML snippet capture via `elementFromPoint`

### Main-world scripts

Two scripts injected into the page's main world via `web_accessible_resources` (bypasses isolated world limitation):
- `console-capture.js` — patches `console.error`/`console.warn`, buffers 50 entries (500 char max), communicates via `vir-*` custom DOM events
- `shopify-data.js` — reads `window.Shopify` globals, communicates via `vir-*` custom DOM events

## GitHub integration

- Screenshots uploaded as GitHub Release Assets on `visual-issues` release tag
- Issue titles: `[Visual] <description>`, labels: `visual-issue`, `from-extension`
- Issues include environment section (browser, OS, Shopify context), console errors, HTML snippet
- `@claude` tagging in issues triggers AI analysis; `analyzed` label tracks status
- Recently created issues cached locally for immediate display before API indexing

## Conventions

- Manifest permissions: `activeTab`, `storage`, `sidePanel`, host: `<all_urls>`
- Settings stored in `chrome.storage.sync`: `githubPat`, `selectedRepo`, `repoList`
- Tailwind class ordering via prettier-plugin-tailwindcss
- TypeScript strict mode, `prefer-const`, consistent-type-imports
- Import order: external → @extension/* → builtins

## Key constraints

- `captureVisibleTab` rate limited to 2 calls/sec
- `storage.sync` max 100KB total, 8KB per item
- Message max 64 MiB JSON
- Service worker event handlers must be at global scope
- Content scripts share DOM but not JS context with host page — use main-world injection for page globals
