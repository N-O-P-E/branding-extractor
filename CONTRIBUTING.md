# Contributing to Visual Issue Reporter

Thanks for your interest in contributing! Here's how to get started.

## Development Setup

### Prerequisites

- [Node.js](https://nodejs.org/) >= 22.15.1
- [pnpm](https://pnpm.io/) 10.x (`corepack enable && corepack prepare pnpm@latest --activate`)
- Google Chrome

### Getting started

1. Fork and clone the repo:
   ```bash
   git clone https://github.com/<your-username>/visual-issue-reporter.git
   cd visual-issue-reporter
   ```
2. Install dependencies:
   ```bash
   pnpm install
   ```
3. Start the dev server:
   ```bash
   pnpm dev
   ```
4. Load the extension in Chrome:
   - Go to `chrome://extensions`
   - Enable **Developer mode**
   - Click **Load unpacked** and select the `dist/` folder

Changes will hot-reload automatically.

## Code Style

- **Linting:** ESLint — run `pnpm lint` to check, `pnpm lint:fix` to auto-fix
- **Formatting:** Prettier — run `pnpm format`
- **Tailwind:** Class ordering enforced via prettier-plugin-tailwindcss
- **TypeScript:** Strict mode, `prefer-const`, consistent-type-imports

Pre-commit hooks run lint-staged automatically on staged files.

## Submitting a Pull Request

1. Create a feature branch from `main`:
   ```bash
   git checkout -b feat/your-feature
   ```
2. Make your changes with clear, focused commits
3. Ensure linting and type-checking pass:
   ```bash
   pnpm lint && pnpm type-check
   ```
4. Push and open a PR against `main`

### Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/):
- `feat:` new feature
- `fix:` bug fix
- `docs:` documentation
- `chore:` maintenance

## Publishing

Chrome Web Store publishing is handled by maintainers and requires access to store credentials. Contributors do not need to worry about this — just open a PR.

## Issues

Found a bug or have an idea? [Open an issue](https://github.com/N-O-P-E/visual-issue-reporter/issues).
