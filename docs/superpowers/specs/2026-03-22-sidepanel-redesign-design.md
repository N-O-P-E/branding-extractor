# Coworker Side Panel Redesign

## Overview

Replace the popup + content-UI overlay architecture with a Chrome Side Panel that serves as the single command center for all extension interactions. The page becomes a clean canvas for annotation only.

## Goals

- Move all settings, issue creation, and issue browsing into the Side Panel
- Add pencil (freehand drawing) tool alongside the existing rectangle selection tool
- Add labels and assignees as optional fields when creating issues (fetched from the selected repo)
- Use Instrument Serif (headings) and DM Sans (body/subheadings) throughout
- Purple (#8b5cf6) accent color consistent across all UI

## Architecture

### Current Flow

```
Popup (settings + actions)
  → Background (screenshot capture, GitHub API)
    → Content-UI (overlay: selection, form, issues drawer)
```

### New Flow

```
Side Panel (settings, tools, issue creation, issue browsing)
  → Background (screenshot capture, GitHub API, label/assignee fetching)
    → Content-UI (canvas only: screenshot display, selection, pencil, floating toolbar)
```

### Manifest Changes

```json
{
  "permissions": ["activeTab", "storage", "sidePanel"],
  "side_panel": {
    "default_path": "side-panel/index.html"
  }
}
```

- Remove `"action.default_popup"` (no more popup)
- Keep `"action"` for the icon — clicking it opens the Side Panel via `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })`
- Minimum Chrome 114

### New Workspace Package

`pages/side-panel/` — React SPA (Vite), same build setup as `pages/popup/` using `withPageConfig()`.

### Content-UI Simplification

Strip from Content-UI:
- Issue creation form
- Issues drawer / panel
- All form state management

Keep in Content-UI:
- Screenshot display overlay
- Rectangle selection tool
- **New:** Pencil (freehand) drawing tool
- **New:** Floating toolbar (Undo, Done)
- Canvas annotation logic

## Side Panel Views

### 1. Home View

Top-to-bottom layout:

| Section | Content |
|---------|---------|
| Header | "Coworker" (Instrument Serif h1), "Visual issue reporting" subtitle (DM Sans) |
| Repo selector | Dropdown of configured repos. If none configured, shows "Connect GitHub" prompt linking to settings |
| Report tools | Two buttons side by side: "Select" (rectangle) and "Pencil" (freehand). Purple outlined, active state has filled background + glow. Clicking activates the tool on the current page |
| Page issues | List of issues for the current URL. Each card shows: thumbnail, title, status badge (open/closed), number, time ago. Count badge next to heading |
| Settings | Expandable rows: GitHub Token (connected/not), Repositories (manage list), Default Labels |

### 2. Setup View (no token configured)

When no GitHub PAT is stored:
- Header as above
- Prominent "Connect to GitHub" section with PAT input field
- "Validate" button that tests against GitHub API `/user`
- On success: show username, transition to repo setup
- Repo management: add/remove repos in `owner/repo` format
- Same validation as current popup

### 3. Create Issue View

Triggered when Content-UI sends `CAPTURE_COMPLETE` with screenshot data.

| Section | Content |
|---------|---------|
| Header | Back arrow + "Create Issue" (Instrument Serif) |
| Screenshot preview | The annotated screenshot (with selection rectangle and/or pencil strokes). Scaled to fit panel width, border-radius 8px |
| Description | Textarea, placeholder "Describe the issue..." |
| Labels | Multi-select dropdown, fetched from selected repo via GitHub API. Always visible, optional to fill |
| Assignee | Single-select dropdown, fetched from selected repo via GitHub API. Always visible, optional to fill |
| Submit button | Purple gradient button, full width. "Submit Issue" |
| Shortcut hint | "Cmd + Enter" below button |

### 4. Issue Detail (stretch)

Clicking an issue card in the list could expand it inline or navigate to a detail view. Out of scope for initial implementation — clicking opens GitHub URL.

## Annotation Tools

### Rectangle Selection (existing, refined)

1. User clicks "Select" in Side Panel
2. Side Panel sends `ACTIVATE_TOOL { tool: 'select' }` → Background → Content-UI
3. Content-UI shows screenshot overlay with crosshair cursor
4. User drags to select rectangle region
5. Canvas annotates with purple dashed rectangle (#8b5cf6, 3px, dashed)
6. Content-UI sends `CAPTURE_COMPLETE` with annotated screenshot → Side Panel
7. Side Panel transitions to Create Issue view

### Pencil Tool (new)

1. User clicks "Pencil" in Side Panel
2. Side Panel sends `ACTIVATE_TOOL { tool: 'pencil' }` → Background → Content-UI
3. Content-UI shows screenshot overlay with pencil cursor
4. Floating toolbar appears at bottom-center of page: `[Undo ⌘Z] | [Done ↵]`
5. User draws freehand strokes (mousedown → mousemove → mouseup = one stroke)
6. Each stroke rendered on canvas in purple (#8b5cf6, 3px solid, round line cap)
7. Strokes stored in array — Undo removes last stroke and re-renders
8. "Done" button or Enter key finalizes
9. Canvas composites all strokes onto screenshot
10. Content-UI sends `CAPTURE_COMPLETE` with annotated screenshot → Side Panel

### Floating Toolbar

- Position: fixed, bottom center of viewport, inside shadow DOM
- Style: dark pill (`#0f172a` bg, subtle border, shadow), DM Sans font
- Buttons: "Undo" (with ⌘Z hint), divider, "Done" (purple gradient, with ↵ hint)
- Keyboard: Cmd/Ctrl+Z for undo, Enter for done, Escape to cancel
- Only visible during pencil drawing mode

## Message Types (updated)

```typescript
// Side Panel → Background
type ActivateToolMessage = {
  type: 'ACTIVATE_TOOL';
  payload: { tool: 'select' | 'pencil' };
};

type FetchLabelsMessage = {
  type: 'FETCH_LABELS';
  payload: { repo: string };
};

type FetchAssigneesMessage = {
  type: 'FETCH_ASSIGNEES';
  payload: { repo: string };
};

// Background → Content-UI (existing, unchanged)
type ShowScreenshotMessage = {
  type: 'SHOW_SCREENSHOT';
  payload: { screenshotDataUrl: string; tool: 'select' | 'pencil' };
};

// Content-UI → Side Panel (new, replaces form submission)
type CaptureCompleteMessage = {
  type: 'CAPTURE_COMPLETE';
  payload: {
    screenshotDataUrl: string;
    annotatedScreenshotDataUrl: string;
    region?: Region; // only for select tool
    pageUrl: string;
    viewportWidth: number;
    viewportHeight: number;
    htmlSnippet?: string;
  };
};

// Responses
type FetchLabelsResponse = {
  success: boolean;
  labels?: Array<{ name: string; color: string }>;
  error?: string;
};

type FetchAssigneesResponse = {
  success: boolean;
  assignees?: Array<{ login: string; avatar_url: string }>;
  error?: string;
};
```

Existing message types (`START_REPORT`, `CREATE_ISSUE`, `FETCH_PAGE_ISSUES`, `MessageResponse`, `PageIssue`) remain largely unchanged. `CREATE_ISSUE` payload gains optional `labels: string[]` and `assignee: string` fields.

## Communication Pattern

Side Panel ↔ Background: `chrome.runtime.sendMessage` (both are extension pages).

Side Panel ↔ Content-UI: Cannot directly message. Route through Background, or use `chrome.tabs.sendMessage` from Side Panel (Side Panel has access to `chrome.tabs`).

Content-UI → Side Panel: `chrome.runtime.sendMessage` — Background relays or Side Panel listens via `chrome.runtime.onMessage`.

## Fonts

- **Instrument Serif** — all `h1`, `h2`, `h3` headings
- **DM Sans** — all body text, labels, buttons, inputs, subheadings
- Loaded via `@import` from Google Fonts in the Side Panel's CSS (extension pages can load external fonts)
- Floating toolbar on page also uses DM Sans (bundled in content-UI CSS or loaded from extension URL via `chrome.runtime.getURL`)

Font loading in content scripts: Google Fonts cannot be fetched from injected content scripts due to CSP. Instead, bundle the font files in the extension and reference via `chrome.runtime.getURL('fonts/dm-sans.woff2')` in the shadow DOM stylesheet, or declare them as `web_accessible_resources`.

## Color Palette

| Token | Value | Usage |
|-------|-------|-------|
| bg-primary | #0f172a | Panel background, toolbar background |
| bg-secondary | rgba(148,163,184,0.08) | Input backgrounds, cards |
| text-primary | #f1f5f9 | Headings, primary text |
| text-secondary | rgba(241,245,249,0.45) | Subtitles, hints |
| text-muted | rgba(241,245,249,0.3) | Shortcut hints, placeholders |
| purple-500 | #8b5cf6 | Annotation color, active states |
| purple-400 | #a78bfa | Links, accent text |
| purple-gradient | #7c3aed → #9333ea | Submit button, Done button |
| purple-glow | rgba(139,92,246,0.2) | Active tool glow |
| border | rgba(148,163,184,0.15) | Card borders, input borders |
| success | #4ade80 | Open badge, connected indicator |
| error | #f87171 | Error states |

## GitHub API Additions

### Fetch Labels

```
GET /repos/{owner}/{repo}/labels
```

Returns array of `{ name, color, description }`. Cache in memory per repo, refresh on repo switch.

### Fetch Assignees

```
GET /repos/{owner}/{repo}/assignees
```

Returns array of `{ login, avatar_url }`. Cache in memory per repo, refresh on repo switch.

### Create Issue (updated)

```
POST /repos/{owner}/{repo}/issues
Body: {
  title: "[Visual] ...",
  body: "...",
  labels: ["visual-issue", ...userSelectedLabels],
  assignees: [selectedAssignee] // optional
}
```

## Files Changed / Created

### New Files

| File | Purpose |
|------|---------|
| `pages/side-panel/` | New workspace package — Side Panel React SPA |
| `pages/side-panel/src/index.tsx` | Entry point |
| `pages/side-panel/src/SidePanel.tsx` | Main component with view routing |
| `pages/side-panel/src/views/HomeView.tsx` | Repo selector, tools, issues list |
| `pages/side-panel/src/views/SetupView.tsx` | GitHub PAT + repo configuration |
| `pages/side-panel/src/views/CreateIssueView.tsx` | Screenshot preview, form, labels/assignee |
| `pages/side-panel/src/components/RepoSelector.tsx` | Repo dropdown |
| `pages/side-panel/src/components/IssueCard.tsx` | Issue list item |
| `pages/side-panel/src/components/LabelSelect.tsx` | Multi-select labels dropdown |
| `pages/side-panel/src/components/AssigneeSelect.tsx` | Single-select assignee dropdown |
| `pages/side-panel/src/styles/` | CSS with font imports, color tokens |

### Modified Files

| File | Changes |
|------|---------|
| `chrome-extension/manifest.ts` | Add `sidePanel` permission, `side_panel` config, remove popup |
| `chrome-extension/src/background/index.ts` | Add `setPanelBehavior`, relay `ACTIVATE_TOOL`/`CAPTURE_COMPLETE`, add label/assignee fetch handlers, add labels/assignee to issue creation |
| `packages/shared/lib/messages.ts` | Add new message types |
| `pages/content-ui/src/matches/all/App.tsx` | Remove form + issues drawer, add pencil tool + floating toolbar, send `CAPTURE_COMPLETE` instead of `CREATE_ISSUE` |
| `packages/ui/global.css` | Add Instrument Serif + DM Sans font declarations |

### Removed / Deprecated

| File | Reason |
|------|--------|
| `pages/popup/` | Replaced entirely by Side Panel (can keep for backward compat but should remove) |

## Error Handling

- **No GitHub token:** Home view shows Setup prompt instead of tools/issues
- **Token expired/invalid:** Show inline error in settings, re-prompt for new token
- **Label/assignee fetch fails:** Show fields as plain text inputs (fallback), log error
- **Screenshot capture fails:** Show error in Side Panel with retry option
- **Side Panel not supported (Chrome <114):** Fallback to popup (keep popup build, conditional manifest)

## Out of Scope

- Issue detail view in Side Panel (click opens GitHub)
- Editing/deleting issues from the panel
- Multiple screenshot annotations per issue
- Video/GIF recording
- Chrome <114 fallback (popup kept as build target but not actively maintained)
