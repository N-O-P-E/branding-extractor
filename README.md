# Visual GitHub Reporter

**by Studio N.O.P.E.**

Chrome extension for reporting visual issues directly to GitHub. Capture annotated screenshots and create issues with full context — no context-switching required.

## Features

- Screenshot capture with region selection and annotation
- Creates GitHub issues with screenshot, description, and environment info
- Issues panel: see all reported issues for the current page
- Detects environment (live, preview, local dev)
- Screenshots stored as GitHub Release Assets
- Inline settings in popup (GitHub token + repo management)

---

## Installation

### Download and Install (Recommended)

**No coding required** — just download, unzip, and load in Chrome.

1. **Download** the latest release:  
   👉 [visual-github-reporter.zip](https://github.com/N-O-P-E/visual-github-reporter/releases/latest/download/visual-github-reporter.zip)

2. **Unzip** the downloaded file

3. **Load in Chrome:**
   - Open Chrome and go to `chrome://extensions`
   - Enable **Developer mode** (toggle in the top-right corner)
   - Click **Load unpacked**
   - Select the unzipped folder

4. **Configure:**
   - Click the Visual GitHub Reporter icon in your toolbar
   - Click the ⚙️ gear icon to open **Settings**
   - Add your **GitHub Personal Access Token**:
     - Go to [github.com/settings/tokens/new](https://github.com/settings/tokens/new)
     - Select the `repo` scope
     - Generate and paste the token, then click **Validate**
   - Add one or more **repositories** in `owner/repo` format

Done! You're ready to report issues.

---

## Usage

1. Navigate to the page where you want to report an issue
2. Click the Visual GitHub Reporter icon and select a target repo
3. Click **Report Issue**
4. Draw a region on the page to highlight the problem area
5. Use the annotation tools to add context
6. Fill in the issue form with a title and description
7. Submit — the issue is created on GitHub with the screenshot and details

To view existing issues for the current page, open the popup and check the issues list.

---

## Development Setup

For contributors who want to build from source.

### Prerequisites

- [Node.js](https://nodejs.org/) >= 22.15.1
- [pnpm](https://pnpm.io/) 10.x (`corepack enable && corepack prepare pnpm@latest --activate`)
- Google Chrome

### Build from source

```bash
git clone https://github.com/N-O-P-E/visual-github-reporter.git
cd visual-github-reporter
pnpm install
pnpm build
```

Then load the `dist/` folder as an unpacked extension.

### Development commands

```bash
pnpm dev       # Development build with HMR
pnpm build     # Production build
pnpm zip       # Build and zip for distribution
pnpm lint      # Lint all packages
pnpm format    # Format all packages
```

---

## Distribution

Build and share the `dist/` folder, or use `pnpm zip` to create `visual-github-reporter.zip` for distribution.

---

## License

MIT © Studio N.O.P.E.
