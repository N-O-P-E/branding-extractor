<p align="center">
  <img src="header.jpg" alt="Visual Issue Reporter — Create Visual Issues, Made by Studio N.O.P.E." />
</p>

# Visual Issue Reporter

Chrome extension for reporting visual issues on Shopify storefronts. Captures annotated screenshots and creates GitHub issues with full browser and Shopify context.

By [Studio N.O.P.E.](https://studionope.nl)

## Features

- **Screenshot & annotate** — capture any region, draw, add text, place images
- **Three tools** — Select (region), Canvas (annotate), Inspect (pick DOM elements)
- **GitHub issues** — creates issues with screenshot, environment info, HTML snippet, and console errors
- **Shopify-aware** — detects store, theme, template, and environment (live/preview/editor/local)
- **Side panel UI** — repo selector, label/assignee pickers, page issues list
- **AI analysis** — tag `@claude` on any issue for an implementation plan

---

## Installation

### Chrome Web Store

Install from the [Chrome Web Store](https://chromewebstore.google.com) (search "Visual Issue Reporter").

### Manual install

1. Download [visual-issue-reporter.zip](https://github.com/N-O-P-E/visual-issue-reporter/releases/latest/download/visual-issue-reporter.zip)
2. Unzip the file
3. Go to `chrome://extensions`, enable **Developer mode**
4. Click **Load unpacked** and select the unzipped folder

### Setup

1. Click the extension icon to open the side panel
2. Add your **GitHub Personal Access Token** ([create one](https://github.com/settings/tokens/new) with `repo` scope)
3. Search and add repositories to report issues to

---

## Usage

1. Navigate to the page with the issue
2. Select a target repo in the side panel
3. Pick a tool — **Select** to highlight a region, **Canvas** to draw/annotate, or **Inspect** to pick a DOM element
4. Annotate the screenshot with drawing, text, or images
5. Fill in a title and description, pick labels and assignee
6. Submit — the issue is created on GitHub with the annotated screenshot and full context

Open the side panel to see all reported issues for the current page. Click **Show on page** to overlay them.

---

## Development

### Prerequisites

- [Node.js](https://nodejs.org/) >= 22.15.1
- [pnpm](https://pnpm.io/) 10.x
- Google Chrome

### Getting started

```bash
git clone https://github.com/N-O-P-E/visual-issue-reporter.git
cd visual-issue-reporter
pnpm install
pnpm dev
```

Load `dist/` as an unpacked extension in `chrome://extensions` (Developer mode). Changes hot-reload.

### Commands

```bash
pnpm dev           # development build with HMR
pnpm build         # production build
pnpm zip           # build + zip for distribution
pnpm lint          # eslint
pnpm format        # prettier
pnpm type-check    # tsc across all workspaces
pnpm e2e           # end-to-end tests
```

### Project structure

```
chrome-extension/       manifest, background service worker
pages/
  side-panel/           side panel UI (repo selector, issue form, settings)
  content-ui/           page overlay (screenshot, annotation canvas, issues panel)
  content/              content script (DOM inspection, main-world injection)
  popup/                extension popup
packages/
  shared/               message types, browser metadata, console capture, utilities
  ui/                   Tailwind config helper
  i18n/                 locale files
  env/                  environment flags
  hmr/                  hot module reload
  vite-config/          shared Vite setup
```

---

## License

MIT
