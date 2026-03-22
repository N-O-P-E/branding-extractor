# APA Coworker

Chrome extension for reporting visual issues on Shopify storefronts. Captures annotated screenshots and creates GitHub issues with full context.

## Features

- Screenshot capture with region selection and annotation
- Creates GitHub issues with screenshot, description, environment info, and HTML snippet
- Issues panel: see all reported issues for the current page
- Detects environment (live, preview, editor, local) and Shopify template
- Screenshots stored as GitHub Release Assets
- Inline settings in popup (GitHub token + repo management)
- Tag `@claude` on any issue to get an AI-powered implementation plan

---

## Installation

### Download and Install (Recommended)

**No coding required** — just download, unzip, and load in Chrome.

1. **Download** the latest release:  
   👉 [apa-coworker-extension.zip](https://github.com/askphill/apa-coworker/releases/latest/download/apa-coworker-extension.zip)

2. **Unzip** the downloaded file

3. **Load in Chrome:**
   - Open Chrome and go to `chrome://extensions`
   - Enable **Developer mode** (toggle in the top-right corner)
   - Click **Load unpacked**
   - Select the unzipped `apa-coworker-extension` folder

4. **Configure:**
   - Click the APA Coworker icon in your toolbar
   - Click the ⚙️ gear icon to open **Settings**
   - Add your **GitHub Personal Access Token**:
     - Go to [github.com/settings/tokens/new](https://github.com/settings/tokens/new)
     - Select the `repo` scope
     - Generate and paste the token, then click **Validate**
   - Add one or more **repositories** in `owner/repo` format (e.g. `askphill/apa-base`)

Done! You're ready to report issues.

---

## Usage

1. Navigate to the Shopify page where you want to report an issue
2. Click the APA Coworker icon and select a target repo
3. Click **Report Issue**
4. Draw a region on the page to highlight the problem area
5. Use the annotation tools to add context
6. Fill in the issue form with a title and description
7. Submit — the issue is created on GitHub with the screenshot and details

To view existing issues for the current page, open the popup and check the issues list. Click **Show on page** to see them overlaid.

---

## Development Setup

For contributors who want to build from source.

### Prerequisites

- [Node.js](https://nodejs.org/) >= 22.15.1
- [pnpm](https://pnpm.io/) 10.x (`corepack enable && corepack prepare pnpm@latest --activate`)
- Google Chrome

### Build from source

```bash
git clone https://github.com/askphill/apa-coworker.git
cd apa-coworker
pnpm install
pnpm build
```

Then load the `dist/` folder as an unpacked extension (see step 3 above).

### Development commands

```bash
pnpm dev       # Development build with HMR
pnpm build     # Production build
pnpm zip       # Build and zip for distribution
pnpm lint      # Lint all packages
pnpm format    # Format all packages
```

After running `pnpm dev`, load the `dist/` folder as an unpacked extension. Changes will hot-reload.

### Project structure

```
chrome-extension/    Chrome extension manifest and background service worker
pages/
  popup/             Extension popup (main UI + inline settings)
  content-ui/        Content script UI (screenshot overlay, issue form, issues panel)
  content/           Content script (DOM inspection for HTML snippets)
packages/
  shared/            Shared types and utilities
  ui/                Tailwind config helper
  i18n/              Locale files (en)
  env/               Environment variables
  hmr/               Hot module reload for development
  dev-utils/         Manifest parser
  vite-config/       Shared Vite configuration
  tailwindcss-config/ Shared Tailwind configuration
```

### Key files

| File | Purpose |
|------|---------|
| `chrome-extension/src/background/index.ts` | Background service worker: issue creation, screenshot upload, page issue fetching |
| `pages/content-ui/src/matches/all/App.tsx` | Content script UI: screenshot overlay, annotation, issue form, issues panel |
| `pages/popup/src/Popup.tsx` | Popup: repo selector, issue list, inline settings |
| `packages/shared/lib/messages.ts` | Shared message types between background, popup, and content scripts |

---

## Distribution

Build and share the `dist/` folder, or use `pnpm zip` to create `apa-coworker-extension.zip` for easy distribution.
