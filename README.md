<p align="center">
  <img src="vir-gh-image.jpg" alt="Visual Issue Reporter — Create Visual Issues, Made by Studio N.O.P.E." />
</p>

# Visual Issue Reporter

> Report visual issues without switching context. Shorter dev cycles, everyone can contribute, not just developers.

Chrome extension that captures annotated screenshots, records screen videos with narration, and creates GitHub issues with full browser context. Built for teams that move fast.

---

### About Studio N.O.P.E.

**Creative Solution Engineers using AI's infinite possibilities to help humans realise their dreams.**

We're [@tijsluitse](https://github.com/tijsluitse) and [@basfijneman](https://github.com/basfijneman) — two guys who believe the best tools are the ones that get out of your way. We built Visual Issue Reporter because reporting bugs shouldn't require a 12-step process and a screenshot tool. It should be one click, some context, done.

We made this open source because we think every team deserves better dev tools, not just the ones that can afford them. When you fix a bug faster, everyone wins — developers, designers, clients, and the people using the product. Open source means the community can shape this into exactly what they need.

**Want to work with us?** We help teams build smarter workflows with AI-powered tooling, Shopify development, and creative engineering. Reach out at **info@studionope.nl** or visit [studionope.nl](https://studionope.nl).

---

## Features

### 🎯 Capture & Annotate
- **Screenshot & annotate** — capture any region, draw freehand or straight lines (hold Shift), add text comments, place images
- **Three tools** — Select (region), Canvas (annotate), Inspect (pick DOM elements)
- **Keyboard shortcuts** — D (draw), V (pointer), S (select), C (comment), Shift (straight lines), Ctrl+C (copy canvas)

### 📹 Screen Recording
- **Record your tab** — capture video with optional microphone narration
- **Draw while recording** — annotate live on the page
- **Auto-upload** — video attaches to your issue automatically

### 🔗 GitHub Integration
- **One-click issues** — creates issues with screenshot, video, environment info, HTML snippet, and console errors
- **Labels & assignees** — pick from your repo's labels and team members
- **Branch selector** — pick which branch issues are filed against
- **Page issues list** — see all reported issues for the current page

### 🤖 Auto-fix with Claude
- **AI-powered fixes** — Claude analyzes your issue and creates a PR
- **Custom prompts** — configure how Claude approaches fixes
- **GitHub Actions** — automatically sets up the workflow in your repo
- **One checkbox** — just check "Auto-fix with Claude" when submitting

### 🛍️ Shopify Support
- **Store detection** — automatically detects store, theme, and template
- **Environment aware** — knows if you're on live, preview, editor, or local
- **Theme editor link** — direct link to the relevant section in Shopify admin

### 🎨 Theming
- **White-label themes** — custom branded themes, unlockable with activation codes
- **Full customization** — colors, accents, footer branding, and extension icon

---

## Theming

Visual Issue Reporter supports custom branded themes. Themes change the entire look and feel of the extension — colors, accents, footer branding, and even the extension icon.

### Activating a theme

1. Open the side panel and go to **Settings**
2. Scroll to **Theme** and enter an activation code
3. The theme unlocks and applies immediately

### Get your own branded theme — for free

We build custom white-label themes for agencies and teams. Your brand colors, your fonts, your logo. To get one:

1. Share Visual Issue Reporter — post on X, Reddit, or star the repo on GitHub
2. Email **makemytheme@studionope.nl** with proof of sharing and your brand details
3. We'll send your activation code within 48 hours

---

## Installation

### Chrome Web Store

Install from the [Chrome Web Store](https://chromewebstore.google.com/detail/visual-issue-reporter/placeholder) *(coming soon)*

### Manual Install

1. Download [visual-issue-reporter.zip](https://github.com/N-O-P-E/visual-issue-reporter/releases/latest/download/visual-issue-reporter.zip)
2. Unzip the file
3. Go to `chrome://extensions`, enable **Developer mode**
4. Click **Load unpacked** and select the unzipped folder

---

## Quick Start

1. Click the extension icon to open the side panel
2. Follow the onboarding wizard
3. Add your **GitHub Personal Access Token** ([create one](https://github.com/settings/tokens/new) with `repo` scope)
4. Search and add repositories to report issues to

### Auto-fix Setup (Optional)

1. Go to **Settings** → **Auto-fix with Claude**
2. Add your Anthropic API key
3. Configure the system prompt (or use the default)
4. Check "Auto-fix with Claude" when creating issues

---

## Usage

### Reporting a visual issue

1. Navigate to the page with the issue
2. Select a target repo and branch in the side panel
3. Pick a tool — **Select** to highlight a region, **Canvas** to draw/annotate, **Inspect** to pick a DOM element, or **Record** to capture a screen recording
4. Annotate the screenshot with drawing, text, or images
5. Fill in a description, pick labels and assignee
6. Submit — the issue is created on GitHub with the annotated screenshot and full context

### Screen recording

1. Click **Record** in the side panel
2. Select the tab to record in Chrome's picker
3. Use **D** to draw on the page, **V** to switch back to pointer mode
4. Click **Stop** when done — the video uploads automatically
5. Submit the issue with the recording attached

### Microphone narration

Toggle **Microphone** before recording to narrate while you capture. Chrome will ask for mic permission on first use.

### Auto-fix with Claude Code

1. Go to Settings > Auto-fix with Claude Code
2. Add your `ANTHROPIC_API_KEY` secret to the repo
3. Install the workflow file
4. Check **Auto-fix** when submitting an issue — Claude will analyze the codebase and propose a fix

---

## How Auto-fix Works

1. You report an issue with "Auto-fix with Claude" checked
2. The extension ensures a GitHub Action workflow exists in your repo
3. The issue is labeled with `auto-fix`
4. GitHub Actions triggers Claude Code
5. Claude analyzes the issue (screenshot, description, environment, HTML)
6. Claude creates a PR with the fix

The workflow uses [claude-code-action](https://github.com/anthropics/claude-code-action) and requires an `ANTHROPIC_API_KEY` secret in your repository.

---

## Development

### Prerequisites

- [Node.js](https://nodejs.org/) >= 22.15.1
- [pnpm](https://pnpm.io/) 10.x
- Google Chrome

### Getting Started

```bash
git clone https://github.com/N-O-P-E/visual-issue-reporter.git
cd visual-issue-reporter
pnpm install
pnpm dev
```

Load `dist/` as an unpacked extension in `chrome://extensions` (Developer mode). Changes hot-reload.

### Commands

| Command | Description |
|---------|-------------|
| `pnpm dev` | Development build with HMR |
| `pnpm build` | Production build |
| `pnpm zip` | Build + zip for distribution |
| `pnpm lint` | ESLint |
| `pnpm format` | Prettier |
| `pnpm type-check` | TypeScript check |
| `pnpm e2e` | End-to-end tests |

### Project Structure

```
chrome-extension/       # Manifest, background service worker
pages/
  side-panel/           # Side panel UI (repo selector, issue form, settings)
  content-ui/           # Page overlay (screenshot, annotation canvas, recording overlay)
  content/              # Content script (DOM inspection, main-world injection)
  popup/                # Extension popup
packages/
  shared/               # Message types, utilities, browser metadata
  ui/                   # Tailwind config
  i18n/                 # Localization
  env/                  # Environment flags
  hmr/                  # Hot module reload
  vite-config/          # Shared Vite setup
```

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

---

## Security

See [SECURITY.md](SECURITY.md) for reporting vulnerabilities.

---

## License

MIT — see [LICENSE](LICENSE)

---

## Star History

<a href="https://star-history.com/#N-O-P-E/visual-issue-reporter&Timeline">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=N-O-P-E/visual-issue-reporter&type=Timeline&theme=dark" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=N-O-P-E/visual-issue-reporter&type=Timeline" />
   <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=N-O-P-E/visual-issue-reporter&type=Timeline" />
 </picture>
</a>
