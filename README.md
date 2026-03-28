# Branding Extractor

> Extract design systems from any website. Colors, typography, spacing, components, and animations — all in one click.

Chrome extension that inspects live pages to pull out color palettes, typography scales, spacing tokens, component patterns, and animation properties. Export as JSON design tokens, CSS variables, or Tailwind config. Built by Studio N.O.P.E.

---

### About Studio N.O.P.E.

**Creative Solution Engineers using AI's infinite possibilities to help humans realise their dreams.**

We're [@tijsluitse](https://github.com/tijsluitse) and [@basfijneman](https://github.com/basfijneman). We built Branding Extractor because reverse-engineering a website's design system shouldn't take hours of inspecting elements one by one. One click, full design system, done.

**Want to work with us?** We help teams build smarter workflows with AI-powered tooling, Shopify development, and creative engineering. Reach out at **info@studionope.nl** or visit [studionope.nl](https://studionope.nl).

---

## Features

### Colors
- Extract all colors used on a page (color, background, border, outline)
- Detect CSS custom properties (`--primary`, `--brand-blue`, etc.)
- HSL, RGB, and hex values with usage counts
- Click any swatch to copy

### Typography
- Font families, sizes, weights, line-heights, letter-spacing
- Grouped by unique style combinations
- See which HTML elements use each style

### Spacing
- Padding, margin, and gap values
- Visual scale showing proportional sizes
- Track which properties use each value

### Components
- Pattern-detect buttons, inputs, and cards
- See selectors and key styles
- Count how many instances exist

### Animations
- Transitions and CSS animations
- Duration, timing function, and delay
- Visual timeline preview

### Export
- **JSON Design Tokens** — W3C-compatible token format
- **CSS Variables** — Ready-to-use `:root` block
- **Tailwind Config** — Drop-in `theme.extend` config

### Saved Brandings
- Save extractions for later reference
- Compare design systems across sites
- Export saved brandings anytime

---

## Installation

### Manual Install

1. Download or clone this repository
2. Run `pnpm install && pnpm build`
3. Go to `chrome://extensions`, enable **Developer mode**
4. Click **Load unpacked** and select the `dist/` folder

---

## Usage

1. Navigate to any website
2. Click the extension icon to open the side panel
3. Click **Extract** to analyze the page's design system
4. Browse results across tabs: Colors, Typography, Spacing, Components, Animations
5. Click any value to copy it to clipboard
6. Use **Export** to download as JSON tokens, CSS variables, or Tailwind config
7. Use **Save** to store the branding for later

---

## Development

### Prerequisites

- [Node.js](https://nodejs.org/) >= 22.15.1
- [pnpm](https://pnpm.io/) 10.x
- Google Chrome

### Getting Started

```bash
git clone https://github.com/N-O-P-E/branding-extractor.git
cd branding-extractor
pnpm install
pnpm dev
```

Load `dist/` as an unpacked extension in `chrome://extensions` (Developer mode). Changes hot-reload.

### Commands

| Command | Description |
|---------|-------------|
| `pnpm dev` | Development build with HMR |
| `pnpm build` | Production build |
| `pnpm test` | Run extraction engine tests |
| `pnpm zip` | Build + zip for distribution |
| `pnpm lint` | ESLint |
| `pnpm format` | Prettier |
| `pnpm type-check` | TypeScript check |

### Project Structure

```
chrome-extension/       # Manifest, background service worker
pages/
  side-panel/           # Side panel UI (extraction display, export, saved brandings)
  content-ui/           # Page overlay (placeholder for future visual features)
  content/              # Content script (extraction engine integration)
packages/
  extractor/            # Design system extraction engine (colors, typography, spacing, components, animations)
  exporter/             # Export formatters (JSON tokens, CSS variables, Tailwind config)
  storage/              # Chrome storage abstraction for saved brandings
  shared/               # Message types and utilities
  ui/                   # Shared UI utilities
  i18n/                 # Localization
  env/                  # Environment flags
  hmr/                  # Hot module reload
  vite-config/          # Shared Vite setup
```

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

---

## License

MIT — see [LICENSE](LICENSE)
