# Onboarding Wizard Design

## Overview

A multi-step onboarding wizard for the Visual Issue Reporter Chrome extension. Two logical "chapters" in a single component: **Chapter 1 (Basics)** covers GitHub token and repo setup; **Chapter 2 (Claude Code)** covers Anthropic API key, repo secrets, and workflow file setup. Chapter 2 is optional and independently re-enterable.

## Presentation

**Center modal overlay** — floats over the current side panel view with a semi-transparent backdrop. Dismissible via X button. Keeps the user's context visible underneath.

## Chapters & Steps

### Chapter 1: Basic Setup

Triggered automatically on first launch (no GitHub token configured).

| Step | Title | Content | Validation |
|------|-------|---------|------------|
| 1 | Welcome | Logo, tagline, "Get Started" button | None — just a CTA |
| 2 | Connect GitHub | Token input + Validate button, link to create classic token with `repo` scope | Token must be validated (green "Connected") before Next |
| 3 | Add Repositories | Searchable repo picker (reuses existing component), added repos list with remove | At least 1 repo added |
| 4 | Enable Claude Code? | Fork screen — "Skip for now" or "Yes, set it up" | Choice determines whether Chapter 2 follows |

"Skip for now" → closes wizard, user lands on HomeView.
"Yes, set it up" → continues to Chapter 2.

### Chapter 2: Claude Code Setup

Triggered from Chapter 1 "Yes" button, or independently from entry points.

| Step | Title | Content | Validation |
|------|-------|---------|------------|
| 5 | Connect Anthropic | API key input + Validate button, link to console.anthropic.com | Key must be validated before Next |
| 6 | Add Secrets to Repos | Copy API key button, per-repo status (green/red dot), "Add secret →" links to GitHub, "Re-check" button | All repos show green (secret exists) — or user can proceed with partial setup |
| 7 | Add Workflow File | Copyable YAML block, per-repo status, "Add workflow →" links to GitHub file creator, "Re-check" button | All repos show green — or user can proceed |
| 8 | Done! | Success checkmark, confirmation message, "Start Reporting" button | None |

Steps 6 and 7 allow proceeding even if not all repos are green (user may only want some repos configured). The "Next" button text changes to "Continue anyway" when incomplete.

## Entry Points

1. **First launch** — auto-opens Chapter 1 when no GitHub token is stored
2. **Settings → "Auto-fix with Claude Code" row** — when status is "Not configured" or "Setup incomplete", opens Chapter 2
3. **Success screen after "no-workflow" result** — "Complete setup" button opens Chapter 2
4. **Dedicated "Setup Guide" button** — inside the Auto-fix accordion in Settings, always available, opens Chapter 2

## Navigation

- **Progress dots** at top of modal — small circles, filled for completed/current, outlined for upcoming. Chapter 1 and Chapter 2 dots visually separated (gap or divider).
- **Back button** (← arrow) — always available except on Step 1. Returns to previous step.
- **Next button** — disabled until step validation passes. Purple gradient when active.
- **Skip** — available on Step 4 (fork screen) and Steps 6/7 (partial repo setup).
- **X close button** — dismisses modal. Progress is saved to `chrome.storage.local` so reopening resumes where the user left off.

## Component Architecture

### New files

- `pages/side-panel/src/components/OnboardingWizard.tsx` — the modal component with all step logic

### Modified files

- `SidePanel.tsx` — state for wizard visibility, renders `<OnboardingWizard>` when open
- `HomeView.tsx` — entry points trigger wizard open with chapter parameter
- `SetupView.tsx` — "Setup Guide" button triggers wizard open for Chapter 2
- `CreateIssueView.tsx` — success screen "Complete setup" triggers wizard

### State management

Wizard state stored in React state within `SidePanel.tsx` and passed down:
- `wizardOpen: boolean`
- `wizardChapter: 1 | 2`
- `onOpenWizard(chapter: 1 | 2): void`
- `onCloseWizard(): void`

Step progress persisted to `chrome.storage.local` under key `onboardingProgress`:
```typescript
interface OnboardingProgress {
  chapter1Complete: boolean;
  chapter2Complete: boolean;
  lastStep: number;
}
```

### Reused logic

Token validation, repo fetching, Anthropic key validation, secret/workflow checks — all reuse existing background message handlers (`VALIDATE_TOKEN`, `FETCH_REPOS`, `CHECK_REPO_SECRET`, `CHECK_REPO_WORKFLOW`). No new background code needed.

## Visual Design

- Modal: `background: #1e293b`, `border: 1px solid rgba(148,163,184,0.2)`, `border-radius: 16px`, `box-shadow: 0 16px 64px rgba(0,0,0,0.5)`
- Backdrop: `background: rgba(0,0,0,0.6)`, `backdrop-filter: blur(4px)`
- Progress dots: 8px circles, `#8B5CF6` filled, `rgba(139,92,246,0.3)` outlined
- Transitions: steps cross-fade with 0.2s opacity transition
- Consistent with existing extension design system (colors, fonts, input styles, button styles)
