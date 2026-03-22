# Side Panel Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the popup with a Chrome Side Panel that houses settings, annotation tools, issue creation (with labels/assignees), and issue browsing — while simplifying content-UI to a pure drawing canvas.

**Architecture:** New `pages/side-panel/` React SPA registered via `chrome.sidePanel` API. Content-UI stripped of form/drawer, gains pencil tool + floating toolbar. Communication: Side Panel ↔ Background via `chrome.runtime.sendMessage`, Background → Content-UI via `chrome.tabs.sendMessage`, Content-UI → Side Panel via `chrome.runtime.sendMessage` (Side Panel listens directly).

**Tech Stack:** React, Vite, Tailwind CSS, Chrome Side Panel API (Chrome 114+), Instrument Serif + DM Sans fonts, @octokit/rest

**Spec:** `docs/superpowers/specs/2026-03-22-sidepanel-redesign-design.md`

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `pages/side-panel/package.json` | Workspace package definition |
| `pages/side-panel/index.html` | HTML entry point |
| `pages/side-panel/vite.config.mts` | Vite build config (outputs to `dist/side-panel/`) |
| `pages/side-panel/tsconfig.json` | TypeScript config |
| `pages/side-panel/tailwind.config.ts` | Tailwind config with content paths |
| `pages/side-panel/src/index.tsx` | React mount point |
| `pages/side-panel/src/index.css` | Global styles, font imports |
| `pages/side-panel/src/SidePanel.tsx` | Root component with view routing |
| `pages/side-panel/src/views/HomeView.tsx` | Repo selector, tools, issues list, settings |
| `pages/side-panel/src/views/SetupView.tsx` | GitHub PAT + repo configuration |
| `pages/side-panel/src/views/CreateIssueView.tsx` | Screenshot preview, form, labels, assignee |
| `pages/side-panel/src/components/RepoSelector.tsx` | Repo dropdown component |
| `pages/side-panel/src/components/IssueCard.tsx` | Issue list item |
| `pages/side-panel/src/components/LabelSelect.tsx` | Multi-select labels dropdown |
| `pages/side-panel/src/components/AssigneeSelect.tsx` | Single-select assignee dropdown |
| `pages/side-panel/src/components/ToolButton.tsx` | Select/Pencil tool button |

### Modified Files

| File | Changes |
|------|---------|
| `packages/shared/lib/messages.ts` | Add new message types, make `region` optional on `CreateIssueMessage` |
| `chrome-extension/manifest.ts` | Add `sidePanel` permission, `side_panel` config, remove `default_popup`, add font files to web_accessible_resources |
| `chrome-extension/src/background/index.ts` | Add `setPanelBehavior`, handle `ACTIVATE_TOOL`/`FETCH_LABELS`/`FETCH_ASSIGNEES`, make region conditional in issue body, pass labels/assignee to issue creation |
| `pages/content-ui/src/matches/all/App.tsx` | Remove form + issues drawer, add pencil tool + floating toolbar, send `CAPTURE_COMPLETE` |
| `packages/ui/global.css` | Add Instrument Serif + DM Sans font-face declarations for extension pages |

### Removed

| File | Reason |
|------|--------|
| `pages/popup/` | Replaced by Side Panel (remove in final task) |

---

## Task 1: Update Shared Message Types

**Files:**
- Modify: `packages/shared/lib/messages.ts`

- [ ] **Step 1: Add new message interfaces and update existing ones**

Add after the existing `ShowScreenshotMessage` interface:

```typescript
export interface ActivateToolMessage {
  type: 'ACTIVATE_TOOL';
  payload: { tool: 'select' | 'pencil' };
}

export interface CaptureCompleteMessage {
  type: 'CAPTURE_COMPLETE';
  payload: {
    screenshotDataUrl: string;
    annotatedScreenshotDataUrl: string;
    region?: Region;
    pageUrl: string;
    viewportWidth: number;
    viewportHeight: number;
    htmlSnippet?: string;
  };
}

export interface FetchLabelsMessage {
  type: 'FETCH_LABELS';
  payload: { repo: string };
}

export interface FetchLabelsResponse {
  success: boolean;
  labels?: Array<{ name: string; color: string }>;
  error?: string;
}

export interface FetchAssigneesMessage {
  type: 'FETCH_ASSIGNEES';
  payload: { repo: string };
}

export interface FetchAssigneesResponse {
  success: boolean;
  assignees?: Array<{ login: string; avatar_url: string }>;
  error?: string;
}
```

- [ ] **Step 2: Update ShowScreenshotMessage to include tool field**

```typescript
export interface ShowScreenshotMessage {
  type: 'SHOW_SCREENSHOT';
  payload: {
    screenshotDataUrl: string;
    tool: 'select' | 'pencil';
  };
}
```

- [ ] **Step 3: Make region optional on CreateIssueMessage, add labels/assignee**

```typescript
export interface CreateIssueMessage {
  type: 'CREATE_ISSUE';
  payload: {
    description: string;
    screenshotDataUrl: string;
    annotatedScreenshotDataUrl: string;
    region?: Region;
    pageUrl: string;
    viewportWidth: number;
    viewportHeight: number;
    template?: string;
    htmlSnippet?: string;
    labels?: string[];
    assignee?: string;
  };
}
```

- [ ] **Step 4: Update ExtensionMessage union type**

```typescript
export type ExtensionMessage =
  | StartReportMessage
  | ShowScreenshotMessage
  | CreateIssueMessage
  | GetHtmlSnippetMessage
  | FetchPageIssuesMessage
  | ShowIssuesPanelMessage
  | ActivateToolMessage
  | CaptureCompleteMessage
  | FetchLabelsMessage
  | FetchAssigneesMessage;
```

- [ ] **Step 5: Verify types compile**

Run: `pnpm type-check`
Expected: No errors in `packages/shared`

- [ ] **Step 6: Commit**

```bash
git add packages/shared/lib/messages.ts
git commit -m "feat: add side panel message types, make region optional"
```

---

## Task 2: Scaffold Side Panel Package

**Files:**
- Create: `pages/side-panel/package.json`
- Create: `pages/side-panel/index.html`
- Create: `pages/side-panel/vite.config.mts`
- Create: `pages/side-panel/tsconfig.json`
- Create: `pages/side-panel/tailwind.config.ts`
- Create: `pages/side-panel/src/index.css`
- Create: `pages/side-panel/src/index.tsx`
- Create: `pages/side-panel/src/SidePanel.tsx`

Note: Side Panel package must exist BEFORE updating the manifest, so the build can find the referenced HTML.

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@extension/side-panel",
  "version": "0.6.0",
  "description": "chrome extension - side panel",
  "type": "module",
  "private": true,
  "sideEffects": true,
  "files": [
    "dist/**"
  ],
  "scripts": {
    "clean:node_modules": "pnpx rimraf node_modules",
    "clean:turbo": "rimraf .turbo",
    "clean": "pnpm clean:turbo && pnpm clean:node_modules",
    "build": "vite build",
    "dev": "vite build --mode development",
    "lint": "eslint .",
    "lint:fix": "pnpm lint --fix",
    "format": "prettier . --write --ignore-path ../../.prettierignore",
    "type-check": "tsc --noEmit"
  },
  "dependencies": {
    "@extension/shared": "workspace:*",
    "@extension/ui": "workspace:*"
  },
  "devDependencies": {
    "@extension/tailwindcss-config": "workspace:*",
    "@extension/tsconfig": "workspace:*",
    "@extension/vite-config": "workspace:*"
  },
  "postcss": {
    "plugins": {
      "tailwindcss": {},
      "autoprefixer": {}
    }
  }
}
```

- [ ] **Step 2: Create vite.config.mts**

```typescript
import { resolve } from 'node:path';
import { withPageConfig } from '@extension/vite-config';

const rootDir = resolve(import.meta.dirname);
const srcDir = resolve(rootDir, 'src');

export default withPageConfig({
  resolve: {
    alias: {
      '@src': srcDir,
    },
  },
  publicDir: resolve(rootDir, 'public'),
  build: {
    outDir: resolve(rootDir, '..', '..', 'dist', 'side-panel'),
  },
});
```

- [ ] **Step 3: Create index.html**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Coworker</title>
  </head>

  <body>
    <div id="app-container"></div>
    <script type="module" src="./src/index.tsx"></script>
  </body>
</html>
```

- [ ] **Step 4: Create tsconfig.json**

```json
{
  "extends": "@extension/tsconfig/base",
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@src/*": ["src/*"]
    },
    "types": ["chrome", "node"]
  },
  "include": ["src", "vite.config.mts", "tailwind.config.ts"]
}
```

- [ ] **Step 5: Create tailwind.config.ts**

```typescript
import { withUI } from '@extension/ui';

export default withUI({
  content: ['index.html', 'src/**/*.tsx'],
});
```

- [ ] **Step 6: Create src/index.css**

Font loading: MV3 extension pages block external stylesheets by default CSP. Self-host the fonts instead. Download Instrument Serif and DM Sans woff2 files into `pages/side-panel/public/fonts/` and use local `@font-face` declarations:

```css
@import '@extension/ui/global.css';

@font-face {
  font-family: 'Instrument Serif';
  src: url('/fonts/InstrumentSerif-Regular.woff2') format('woff2');
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}

@font-face {
  font-family: 'Instrument Serif';
  src: url('/fonts/InstrumentSerif-Italic.woff2') format('woff2');
  font-weight: 400;
  font-style: italic;
  font-display: swap;
}

@font-face {
  font-family: 'DM Sans';
  src: url('/fonts/DMSans-Variable.woff2') format('woff2');
  font-weight: 300 600;
  font-style: normal;
  font-display: swap;
}

body {
  width: 100%;
  min-height: 100vh;
  background: #0f172a;
  color: #f1f5f9;
  margin: 0;
  font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;
}

h1, h2, h3 {
  font-family: 'Instrument Serif', serif;
  font-weight: 400;
}
```

Download fonts from Google Fonts (use `https://gwfh.mranftl.com/` or similar tool to get woff2 files) and place in `pages/side-panel/public/fonts/`.

- [ ] **Step 7: Create src/index.tsx**

```tsx
import '@src/index.css';
import SidePanel from '@src/SidePanel';
import { createRoot } from 'react-dom/client';

const init = () => {
  const appContainer = document.querySelector('#app-container');
  if (!appContainer) {
    throw new Error('Can not find #app-container');
  }
  const root = createRoot(appContainer);
  root.render(<SidePanel />);
};

init();
```

- [ ] **Step 8: Create src/SidePanel.tsx (minimal shell)**

```tsx
import { useState, useEffect } from 'react';

type View = 'home' | 'setup' | 'create-issue';

export default function SidePanel() {
  const [view, setView] = useState<View>('home');
  const [hasToken, setHasToken] = useState(false);

  useEffect(() => {
    chrome.storage.sync.get('githubPat', ({ githubPat }) => {
      setHasToken(!!githubPat);
      if (!githubPat) setView('setup');
    });
  }, []);

  // Listen for CAPTURE_COMPLETE from content-UI
  useEffect(() => {
    const listener = (message: { type: string }) => {
      if (message.type === 'CAPTURE_COMPLETE') {
        setView('create-issue');
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  return (
    <div style={{ minHeight: '100vh' }}>
      {view === 'setup' && <div>Setup View (TODO)</div>}
      {view === 'home' && <div>Home View (TODO)</div>}
      {view === 'create-issue' && <div>Create Issue View (TODO)</div>}
    </div>
  );
}
```

- [ ] **Step 9: Install dependencies and verify build**

```bash
pnpm install
pnpm build
```

Expected: `dist/side-panel/index.html` exists with bundled JS/CSS

- [ ] **Step 10: Commit**

```bash
git add pages/side-panel/
git commit -m "feat: scaffold side-panel workspace package"
```

---

## Task 3: Update Manifest for Side Panel

**Files:**
- Modify: `chrome-extension/manifest.ts`

- [ ] **Step 1: Add sidePanel permission and config, remove popup**

Replace the current manifest object:

```typescript
const manifest = {
  manifest_version: 3,
  default_locale: 'en',
  name: 'Coworker',
  version: packageJson.version,
  description: '__MSG_extensionDescription__',
  host_permissions: ['<all_urls>'],
  permissions: ['activeTab', 'storage', 'sidePanel'],
  background: {
    service_worker: 'background.js',
    type: 'module',
  },
  action: {
    default_icon: 'icon-34.png',
  },
  side_panel: {
    default_path: 'side-panel/index.html',
  },
  icons: {
    '128': 'icon-128.png',
  },
  content_scripts: [
    {
      matches: ['http://*/*', 'https://*/*'],
      js: ['content/all.iife.js'],
    },
    {
      matches: ['http://*/*', 'https://*/*'],
      js: ['content-ui/all.iife.js'],
    },
    {
      matches: ['http://*/*', 'https://*/*'],
      css: ['content.css'],
    },
  ],
  web_accessible_resources: [
    {
      resources: ['*.js', '*.css', '*.svg', '*.woff2', '*.woff', 'icon-128.png', 'icon-34.png'],
      matches: ['*://*/*'],
    },
  ],
} as ManifestType & { side_panel: { default_path: string } };
```

Note: `ManifestType` from `@extension/shared` likely does not include `side_panel`. The intersection type adds it cleanly. If the chrome-types package is up to date enough, `satisfies ManifestType` may work directly — try that first.

- [ ] **Step 2: Verify build works**

Run: `pnpm build`
Expected: `dist/manifest.json` contains `side_panel` and `sidePanel` permission, no `default_popup`

- [ ] **Step 3: Commit**

```bash
git add chrome-extension/manifest.ts
git commit -m "feat: add sidePanel to manifest, remove popup"
```

---

## Task 4: Update Background Service Worker

**Files:**
- Modify: `chrome-extension/src/background/index.ts`

- [ ] **Step 1: Add setPanelBehavior at top level**

Add after imports, before the `onMessage` listener:

```typescript
// Open side panel when extension icon is clicked
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);
```

- [ ] **Step 2: Update handleStartReport to accept tool parameter**

Replace `handleStartReport`:

```typescript
const handleStartReport = async (
  tool: 'select' | 'pencil',
  sendResponse: (response: MessageResponse) => void,
) => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab?.id || !tab.url) {
      sendResponse({ success: false, error: 'No active tab found.' });
      return;
    }

    if (tab.url.startsWith('chrome://') || tab.url.startsWith('about://')) {
      sendResponse({ success: false, error: 'Cannot capture this page.' });
      return;
    }

    const screenshotDataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });

    const payload: ShowScreenshotMessage = {
      type: 'SHOW_SCREENSHOT',
      payload: { screenshotDataUrl, tool },
    };

    await chrome.tabs.sendMessage(tab.id, payload);
    sendResponse({ success: true });
  } catch (err) {
    sendResponse({ success: false, error: err instanceof Error ? err.message : 'Unknown error' });
  }
};
```

- [ ] **Step 3: Replace START_REPORT with ACTIVATE_TOOL handler in onMessage listener**

The old `START_REPORT` handler is no longer needed (it was called from the popup which is being removed). Replace it with `ACTIVATE_TOOL`:

```typescript
// Remove:
// if (message.type === 'START_REPORT') {
//   handleStartReport(sendResponse);
//   return true;
// }

// Add:
if (message.type === 'ACTIVATE_TOOL') {
  handleStartReport(message.payload.tool, sendResponse);
  return true;
}
```

- [ ] **Step 4: Add label and assignee fetch handlers**

Add new handler functions:

```typescript
const handleFetchLabels = async (
  message: FetchLabelsMessage,
  sendResponse: (response: FetchLabelsResponse) => void,
) => {
  try {
    const octokit = await getOctokit();
    const [owner, repo] = message.payload.repo.split('/');
    const { data } = await octokit.issues.listLabelsForRepo({
      owner,
      repo,
      per_page: 100,
    });
    sendResponse({
      success: true,
      labels: data.map(l => ({ name: l.name, color: l.color })),
    });
  } catch (err) {
    sendResponse({ success: false, error: err instanceof Error ? err.message : 'Unknown error' });
  }
};

const handleFetchAssignees = async (
  message: FetchAssigneesMessage,
  sendResponse: (response: FetchAssigneesResponse) => void,
) => {
  try {
    const octokit = await getOctokit();
    const [owner, repo] = message.payload.repo.split('/');
    const { data } = await octokit.issues.listAssignees({
      owner,
      repo,
      per_page: 100,
    });
    sendResponse({
      success: true,
      assignees: data.map(a => ({ login: a.login, avatar_url: a.avatar_url ?? '' })),
    });
  } catch (err) {
    sendResponse({ success: false, error: err instanceof Error ? err.message : 'Unknown error' });
  }
};
```

Add to the `onMessage` listener:

```typescript
if (message.type === 'FETCH_LABELS') {
  handleFetchLabels(message, sendResponse as (response: FetchLabelsResponse) => void);
  return true;
}
if (message.type === 'FETCH_ASSIGNEES') {
  handleFetchAssignees(message, sendResponse as (response: FetchAssigneesResponse) => void);
  return true;
}
```

- [ ] **Step 5: Update handleCreateIssue for optional region and labels/assignee**

In `handleCreateIssue`, update the destructuring to include new fields:

```typescript
const {
  description,
  annotatedScreenshotDataUrl,
  region,
  pageUrl,
  viewportWidth,
  viewportHeight,
  template,
  htmlSnippet,
  labels: userLabels,
  assignee,
} = message.payload;
```

Replace the region line in the body builder with a conditional:

```typescript
if (region) {
  body += `- **Region:** x:${Math.round(region.x)}, y:${Math.round(region.y)}, width:${Math.round(region.width)}, height:${Math.round(region.height)}\n`;
}
```

Update the issue creation call to merge labels and add assignee:

```typescript
const issueLabels = ['visual-issue', ...(userLabels ?? [])];
const issue = await octokit.issues.create({
  owner,
  repo,
  title,
  body,
  labels: issueLabels,
  ...(assignee ? { assignees: [assignee] } : {}),
});
```

- [ ] **Step 6: Update imports**

Add to the import from `@extension/shared`:

```typescript
import type {
  ActivateToolMessage,
  CreateIssueMessage,
  ExtensionMessage,
  FetchAssigneesMessage,
  FetchAssigneesResponse,
  FetchLabelsMessage,
  FetchLabelsResponse,
  FetchPageIssuesMessage,
  FetchPageIssuesResponse,
  MessageResponse,
  PageIssue,
  ShowIssuesPanelMessage,
  ShowScreenshotMessage,
} from '@extension/shared';
```

- [ ] **Step 7: Verify types compile**

Run: `pnpm type-check`
Expected: No errors

- [ ] **Step 8: Commit**

```bash
git add chrome-extension/src/background/index.ts
git commit -m "feat: add side panel behavior, label/assignee handlers, optional region"
```

---

## Task 5: Build SetupView (Settings)

**Files:**
- Create: `pages/side-panel/src/views/SetupView.tsx`

- [ ] **Step 1: Create SetupView**

Port the settings logic from `pages/popup/src/Popup.tsx` (token validation, repo management) into a standalone view. The view should:

- GitHub PAT input + "Validate" button
- On validation: fetch `https://api.github.com/user` with Bearer token
- Show connected username on success
- Repo list management: add (with `owner/repo` format validation) and remove
- "Done" button that navigates back to home view
- Style with Instrument Serif headings, DM Sans body, dark theme colors from spec

The `onDone` callback prop signals the parent to switch to home view.

```tsx
interface SetupViewProps {
  onDone: () => void;
}
```

- [ ] **Step 2: Verify it renders**

Run: `pnpm dev`, load extension, click icon → Side Panel should show setup view if no token.

- [ ] **Step 3: Commit**

```bash
git add pages/side-panel/src/views/SetupView.tsx
git commit -m "feat: add SetupView with token validation and repo management"
```

---

## Task 6: Build HomeView

**Files:**
- Create: `pages/side-panel/src/views/HomeView.tsx`
- Create: `pages/side-panel/src/components/RepoSelector.tsx`
- Create: `pages/side-panel/src/components/IssueCard.tsx`
- Create: `pages/side-panel/src/components/ToolButton.tsx`

- [ ] **Step 1: Create RepoSelector component**

Dropdown that reads `repoList` and `selectedRepo` from `chrome.storage.sync`, allows switching. Fires `onChange` when selection changes.

```tsx
interface RepoSelectorProps {
  selectedRepo: string;
  repos: string[];
  onChange: (repo: string) => void;
}
```

- [ ] **Step 2: Create ToolButton component**

Purple-styled button for Select/Pencil tools. Active state with glow.

```tsx
interface ToolButtonProps {
  icon: 'select' | 'pencil';
  label: string;
  active: boolean;
  onClick: () => void;
}
```

- [ ] **Step 3: Create IssueCard component**

Card showing issue thumbnail, title, status badge, number, time ago. Clicking opens GitHub URL.

```tsx
interface IssueCardProps {
  issue: PageIssue;
}
```

- [ ] **Step 4: Create HomeView**

Assembles the full home view:
- Header: "Coworker" h1 + subtitle
- RepoSelector
- Report section: two ToolButtons (Select, Pencil)
- Page Issues section: list of IssueCards, fetched via `FETCH_PAGE_ISSUES`
- Settings section: expandable rows for token status, repos, default labels
- Tool clicks send `ACTIVATE_TOOL` message via `chrome.runtime.sendMessage`

To get the current page URL for fetching issues:
```typescript
const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
const pageUrl = tab?.url ?? '';
```

Props:
```tsx
interface HomeViewProps {
  onOpenSettings: () => void;
}
```

- [ ] **Step 5: Wire up in SidePanel.tsx**

Replace the TODO placeholders with actual view imports and pass appropriate props.

- [ ] **Step 6: Test the full flow**

Run: `pnpm dev`, load extension, open Side Panel → should show repo selector, tools, and issues for current page.

- [ ] **Step 7: Commit**

```bash
git add pages/side-panel/src/views/HomeView.tsx pages/side-panel/src/components/
git commit -m "feat: add HomeView with repo selector, tools, and issue list"
```

---

## Task 7: Build CreateIssueView with Labels & Assignees

**Files:**
- Create: `pages/side-panel/src/views/CreateIssueView.tsx`
- Create: `pages/side-panel/src/components/LabelSelect.tsx`
- Create: `pages/side-panel/src/components/AssigneeSelect.tsx`

- [ ] **Step 1: Create LabelSelect component**

Multi-select dropdown that fetches labels from the selected repo via `FETCH_LABELS` message. Shows label name + color dot. Allows selecting/deselecting multiple.

```tsx
interface LabelSelectProps {
  repo: string;
  selected: string[];
  onChange: (labels: string[]) => void;
}
```

- [ ] **Step 2: Create AssigneeSelect component**

Single-select dropdown that fetches assignees from the selected repo via `FETCH_ASSIGNEES` message. Shows avatar + login.

```tsx
interface AssigneeSelectProps {
  repo: string;
  selected: string;
  onChange: (assignee: string) => void;
}
```

- [ ] **Step 3: Create CreateIssueView**

Layout:
- Back button + "Create Issue" heading
- Screenshot preview (the annotated screenshot from `CAPTURE_COMPLETE` payload)
- Description textarea
- Labels (LabelSelect) and Assignee (AssigneeSelect) side by side
- Submit button (purple gradient)
- Cmd+Enter shortcut

On submit: send `CREATE_ISSUE` message with all fields including labels and assignee. On success: show success state with issue link, then navigate back to home.

Props:
```tsx
interface CreateIssueViewProps {
  captureData: CaptureCompleteMessage['payload'];
  onBack: () => void;
  onSuccess: () => void;
}
```

- [ ] **Step 4: Wire up CAPTURE_COMPLETE listener in SidePanel.tsx**

Update the existing listener to store the capture payload and pass it to CreateIssueView:

```tsx
const [captureData, setCaptureData] = useState<CaptureCompleteMessage['payload'] | null>(null);

useEffect(() => {
  const listener = (message: { type: string; payload?: unknown }) => {
    if (message.type === 'CAPTURE_COMPLETE') {
      setCaptureData(message.payload as CaptureCompleteMessage['payload']);
      setView('create-issue');
    }
  };
  chrome.runtime.onMessage.addListener(listener);
  return () => chrome.runtime.onMessage.removeListener(listener);
}, []);
```

- [ ] **Step 5: Test end-to-end**

1. Open Side Panel, click Select tool
2. Draw region on page
3. Side Panel should switch to CreateIssueView with screenshot
4. Fill description, select labels/assignee
5. Submit → issue created on GitHub

- [ ] **Step 6: Commit**

```bash
git add pages/side-panel/src/views/CreateIssueView.tsx pages/side-panel/src/components/LabelSelect.tsx pages/side-panel/src/components/AssigneeSelect.tsx pages/side-panel/src/SidePanel.tsx
git commit -m "feat: add CreateIssueView with label and assignee selection"
```

---

## Task 8: Refactor Content-UI to Send CAPTURE_COMPLETE & Remove Form/Drawer

**Files:**
- Modify: `pages/content-ui/src/matches/all/App.tsx`

This task strips the form, issues drawer, and success/error states from Content-UI. After this, content-UI only handles screenshot display and annotation — all form UI is in the Side Panel.

- [ ] **Step 1: Update message listener to extract tool**

In the `SHOW_SCREENSHOT` handler, extract the `tool` field and store it in state:

```tsx
const [activeTool, setActiveTool] = useState<'select' | 'pencil'>('select');

// In the message listener:
if (message.type === 'SHOW_SCREENSHOT') {
  setScreenshotDataUrl(message.payload.screenshotDataUrl);
  setActiveTool(message.payload.tool ?? 'select');
  setState('selecting');
}
```

- [ ] **Step 2: Update rectangle selection to send CAPTURE_COMPLETE**

Replace the current flow that transitions to the form state after annotation. Instead, after the user completes rectangle selection and the annotated screenshot is generated, send `CAPTURE_COMPLETE` directly:

```typescript
chrome.runtime.sendMessage({
  type: 'CAPTURE_COMPLETE',
  payload: {
    screenshotDataUrl,
    annotatedScreenshotDataUrl: annotatedDataUrl,
    region: { x, y, width, height },
    pageUrl: window.location.href,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    htmlSnippet: snippet ?? undefined,
  },
});
setState('idle');
```

- [ ] **Step 3: Remove form, submitting, success/error states and their JSX**

Remove:
- State values: `description`, `isSubmitting`, `submissionResult`, `toastMessage`
- States from the state machine: `'form'`, `'submitting'`, `'success'`, `'error'`
- All JSX for the description textarea, submit button, success/error screens
- The `handleSubmit` function that sent `CREATE_ISSUE`
- Simplify state type to: `'idle' | 'selecting'`

- [ ] **Step 4: Remove IssuesPanel component and SHOW_ISSUES_PANEL handler**

Remove:
- The entire `IssuesPanel` component (drawer, lightbox, issue cards)
- The `SHOW_ISSUES_PANEL` message listener
- State: `issuesPanelData`, `showIssuesPanel`
- All related JSX

- [ ] **Step 5: Verify the select tool still works**

Run: `pnpm dev`, click Select in Side Panel → draw rectangle → confirm `CAPTURE_COMPLETE` is received by Side Panel (check via console log or verify CreateIssueView appears).

- [ ] **Step 6: Commit**

```bash
git add pages/content-ui/src/matches/all/App.tsx
git commit -m "refactor: strip form/drawer from content-UI, send CAPTURE_COMPLETE"
```

---

## Task 9: Add Pencil Tool to Content-UI

**Files:**
- Modify: `pages/content-ui/src/matches/all/App.tsx`

- [ ] **Step 1: Add pencil stroke state and drawing logic**

```tsx
interface Stroke {
  points: Array<{ x: number; y: number }>;
}

const [strokes, setStrokes] = useState<Stroke[]>([]);
const [currentStroke, setCurrentStroke] = useState<Stroke | null>(null);
```

During pencil mode (`activeTool === 'pencil'`), on mousedown start a new stroke, on mousemove add points, on mouseup finalize the stroke into the strokes array. Re-render strokes on a preview canvas overlaying the screenshot.

- [ ] **Step 2: Render pencil strokes on canvas**

Create a function `renderPencilStrokes` that draws all strokes on the screenshot canvas:

```typescript
const renderPencilStrokes = (
  ctx: CanvasRenderingContext2D,
  strokes: Stroke[],
  scaleX: number,
  scaleY: number,
) => {
  ctx.strokeStyle = '#8B5CF6';
  ctx.lineWidth = 3 * Math.max(scaleX, scaleY);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (const stroke of strokes) {
    if (stroke.points.length < 2) continue;
    ctx.beginPath();
    ctx.moveTo(stroke.points[0].x * scaleX, stroke.points[0].y * scaleY);
    for (let i = 1; i < stroke.points.length; i++) {
      ctx.lineTo(stroke.points[i].x * scaleX, stroke.points[i].y * scaleY);
    }
    ctx.stroke();
  }
};
```

- [ ] **Step 3: Add floating toolbar**

Render a fixed-position toolbar at bottom-center when in pencil drawing mode. Use system font stack as fallback (Google Fonts blocked by CSP in content scripts):

```tsx
{activeTool === 'pencil' && state === 'selecting' && (
  <div style={{
    position: 'fixed',
    bottom: '24px',
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    gap: '6px',
    padding: '8px 12px',
    background: '#0f172a',
    border: '1px solid rgba(148,163,184,0.2)',
    borderRadius: '12px',
    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    zIndex: 2147483647,
  }}>
    <button onClick={handleUndo} style={undoButtonStyle}>
      ↩ Undo <span style={shortcutStyle}>⌘Z</span>
    </button>
    <div style={dividerStyle} />
    <button onClick={handleDone} style={doneButtonStyle}>
      Done <span style={shortcutStyle}>↵</span>
    </button>
  </div>
)}
```

- [ ] **Step 4: Implement Undo and Done handlers**

```typescript
const handleUndo = () => {
  setStrokes(prev => prev.slice(0, -1));
};

const handleDone = () => {
  // Composite strokes onto screenshot
  const canvas = document.createElement('canvas');
  const img = new Image();
  img.onload = () => {
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0);

    const scaleX = img.naturalWidth / window.innerWidth;
    const scaleY = img.naturalHeight / window.innerHeight;
    renderPencilStrokes(ctx, strokes, scaleX, scaleY);

    const annotatedDataUrl = canvas.toDataURL('image/png');
    chrome.runtime.sendMessage({
      type: 'CAPTURE_COMPLETE',
      payload: {
        screenshotDataUrl,
        annotatedScreenshotDataUrl: annotatedDataUrl,
        pageUrl: window.location.href,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
      },
    });

    setState('idle');
    setStrokes([]);
  };
  img.src = screenshotDataUrl;
};
```

Note: Pencil-only annotations have no `region` or `htmlSnippet` — these are left undefined in the payload.

- [ ] **Step 5: Add keyboard shortcuts**

In the keyboard event handler, add for pencil mode:
- `Cmd/Ctrl+Z` → `handleUndo()`
- `Enter` → `handleDone()`
- `Escape` → cancel and reset to idle

- [ ] **Step 6: Test pencil tool**

1. Open Side Panel, click Pencil → draw strokes on page
2. Undo removes last stroke
3. Done composites strokes and sends `CAPTURE_COMPLETE`
4. Side Panel shows CreateIssueView with annotated screenshot
5. Escape cancels drawing

- [ ] **Step 7: Commit**

```bash
git add pages/content-ui/src/matches/all/App.tsx
git commit -m "feat: add pencil tool with floating toolbar and undo"
```

---

## Task 10: Polish & Typography

**Files:**
- Modify: `packages/ui/global.css`
- Modify: All side-panel view/component files for consistent styling

- [ ] **Step 1: Verify font loading in Side Panel**

Open Side Panel, inspect elements — confirm Instrument Serif on headings, DM Sans on body. The `@import` in `index.css` should handle this for the extension page.

- [ ] **Step 2: Bundle fonts for content-UI floating toolbar**

For the floating toolbar on the page (inside shadow DOM), Google Fonts won't load due to CSP. Either:
- Use system fonts as fallback for the toolbar (simplest — toolbar is tiny)
- Or download DM Sans woff2 files into `chrome-extension/public/fonts/` and reference via `@font-face` with `chrome.runtime.getURL('fonts/dm-sans-400.woff2')` in the content-UI styles

Recommended: system fonts fallback for the toolbar. It's just two buttons.

- [ ] **Step 3: Style consistency pass**

Review all views and components for consistent use of:
- Color tokens from spec (bg-primary, text-primary, purple-500, etc.)
- Spacing (16px/20px padding pattern)
- Border radius (8px cards, 10px buttons, 12px containers)
- Transitions (0.15s for interactive elements)

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: polish typography and styling consistency"
```

---

## Task 11: Clean Up & Final Testing

**Files:**
- Remove: `pages/popup/` (or keep as dead code — discuss with user)
- Modify: `chrome-extension/manifest.ts` (already done in Task 2)

- [ ] **Step 1: Remove popup package**

Delete `pages/popup/` directory since it's fully replaced by the Side Panel.

- [ ] **Step 2: Full build test**

```bash
pnpm install
pnpm build
```

Expected: Clean build, `dist/` contains `side-panel/`, no `popup/`

- [ ] **Step 3: Full e2e test**

Load `dist/` as unpacked extension:
1. Click extension icon → Side Panel opens
2. If no token: Setup view appears, configure PAT + repo
3. Home view: repo selector works, page issues load
4. Click Select → draw region → Side Panel shows Create Issue view
5. Click Pencil → draw strokes → Undo works → Done → Create Issue view
6. Fill description, select labels, select assignee → Submit
7. Issue created on GitHub with correct labels and assignee
8. Back to home → new issue appears in list

- [ ] **Step 4: Lint and type-check**

```bash
pnpm lint
pnpm type-check
```

Fix any issues.

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "chore: remove popup, final cleanup"
```
