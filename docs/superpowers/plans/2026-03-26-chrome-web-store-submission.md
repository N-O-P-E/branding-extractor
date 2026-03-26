# Chrome Web Store Submission Readiness — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Visual Issue Reporter ready for Chrome Web Store submission by optimizing permissions, improving error handling, adding offline detection, and preparing Dutch store listing text.

**Architecture:** Move sensitive permissions (`cookies`, `declarativeNetRequest`) to optional, add fetch timeouts and error classification to the background service worker, add offline detection hook to the side panel, and prepare store listing copy in a docs file.

**Tech Stack:** Chrome MV3, React 18, TypeScript, Vite

**Spec:** `docs/superpowers/specs/2026-03-26-chrome-web-store-submission-design.md`

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `chrome-extension/manifest.ts` | Modify | Move cookies + declarativeNetRequest to optional_permissions |
| `chrome-extension/src/background/index.ts` | Modify | Add fetchWithTimeout, error classification, permission checks, onSuspend cleanup, uninstall URL |
| `pages/side-panel/src/views/HomeView.tsx` | Modify | Add permission request flow before video upload, use fetchWithTimeout |
| `pages/side-panel/src/hooks/useOnlineStatus.ts` | Create | Hook for offline detection |
| `pages/side-panel/src/SidePanel.tsx` | Modify | Add offline banner using useOnlineStatus |
| `docs/chrome-web-store/listing-nl.md` | Create | Dutch store listing text, permission justifications, single purpose declaration |

---

### Task 1: Store Listing Text (Dutch)

**Files:**
- Create: `docs/chrome-web-store/listing-nl.md`

- [ ] **Step 1: Create the Dutch store listing document**

```markdown
# Chrome Web Store Listing — Visual Issue Reporter

## Naam
Visual Issue Reporter by Studio N.O.P.E.

## Korte omschrijving (132 tekens max)
Meld visuele bugs op elke website rechtstreeks in GitHub met screenshots, annotaties en schermopnames.

## Gedetailleerde omschrijving

Visual Issue Reporter maakt het makkelijk om visuele problemen op elke website te melden, rechtstreeks in GitHub.

**Wat kun je ermee?**
- Maak screenshots en teken erop met annotaties om precies aan te geven wat er mis is
- Neem je scherm op, optioneel met microfoon, om bugs in actie te laten zien
- Issues worden automatisch aangemaakt in je GitHub repository, inclusief alle context

**Voor wie?**
Ontwikkelaars, QA teams en projectmanagers die visuele feedback willen stroomlijnen. Geen aparte bugtracker nodig: alles komt direct in GitHub terecht.

**Hoe werkt het?**
1. Open het zijpaneel via de extensie
2. Kies je GitHub repository en branch
3. Gebruik de screenshot of opnametool
4. Voeg een beschrijving toe en dien het issue in

**Privacy en veiligheid**
- Je GitHub token wordt alleen lokaal opgeslagen
- Screenshots en opnames worden uitsluitend naar jouw eigen GitHub repository gestuurd
- Er worden geen gegevens naar derden verzonden
- De extensie bevat geen analytics of tracking

**Optionele functies**
- Schermopnames met inline videoweergave in GitHub (vereist aanvullende toestemming voor cookies)
- Automatische bugfixes via Claude AI (vereist aparte configuratie)

## Eenduidige functie (Single Purpose)
Visuele problemen op elke webpagina melden in GitHub met screenshots, annotaties en schermopnames.

## Toestemmingen (Permission Justifications)

### activeTab
Nodig om screenshots te maken van de huidige pagina en te communiceren met het contentscript dat de tekenoverlay toont.

### storage
Slaat je GitHub token, geselecteerde repository, branch en themavoorkeur lokaal op zodat je niet elke keer opnieuw hoeft in te stellen.

### sidePanel
De hele gebruikersinterface van de extensie draait in het Chrome zijpaneel. Zonder deze toestemming kan de extensie niet functioneren.

### host_permissions: alle websites
De extensie moet werken op elke website die je bezoekt, omdat je visuele bugs kunt melden op elke pagina. Contentscripts moeten op elke pagina worden geladen om de screenshot overlay en tekenfunctionaliteit te bieden.

### cookies (optioneel)
Alleen gebruikt om je GitHub sessiecookies te lezen wanneer je een schermopname uploadt. Dit maakt het mogelijk om video's direct in GitHub issues weer te geven in plaats van als downloadlink. Je kunt deze toestemming weigeren; de extensie valt dan terug op een downloadlink.

### declarativeNetRequest (optioneel)
Werkt samen met de cookies toestemming om authenticatieheaders in te stellen bij het uploaden van schermopnames naar GitHub. Fetch verwijdert bepaalde headers zoals Cookie en Origin; deze toestemming omzeilt dat op netwerkniveau. Wordt alleen gebruikt voor uploads naar github.com.

## Categorie
Developer Tools

## Taal
Nederlands
```

- [ ] **Step 2: Commit**

```bash
git add docs/chrome-web-store/listing-nl.md
git commit -m "docs: add Dutch Chrome Web Store listing text and permission justifications"
```

---

### Task 2: Move Permissions to Optional

**Files:**
- Modify: `chrome-extension/manifest.ts:13`

- [ ] **Step 1: Update manifest to move cookies and declarativeNetRequest to optional_permissions**

In `chrome-extension/manifest.ts`, change:
```ts
permissions: ['activeTab', 'storage', 'sidePanel', 'cookies', 'declarativeNetRequest'],
```
to:
```ts
permissions: ['activeTab', 'storage', 'sidePanel'],
optional_permissions: ['cookies', 'declarativeNetRequest'],
```

- [ ] **Step 2: Build and verify manifest output**

Run: `pnpm build`
Then check `dist/manifest.json` has `optional_permissions` field.

- [ ] **Step 3: Commit**

```bash
git add chrome-extension/manifest.ts
git commit -m "feat: move cookies and declarativeNetRequest to optional_permissions"
```

---

### Task 3: Add Permission Request Flow in HomeView

**Files:**
- Modify: `pages/side-panel/src/views/HomeView.tsx:36-72` (uploadViaUserAttachments function)
- Modify: `pages/side-panel/src/views/HomeView.tsx:358-395` (finishRecording function)

- [ ] **Step 1: Add permission helper at top of HomeView.tsx**

Add after the imports (before the `colors` const):

```ts
/** Check and request optional permissions for video upload (cookies + declarativeNetRequest).
 *  MUST be called synchronously from a user gesture handler — async work before this will lose the gesture context. */
const requestVideoUploadPermissions = async (): Promise<boolean> => {
  const perms = { permissions: ['cookies' as const, 'declarativeNetRequest' as const] };
  const granted = await chrome.permissions.contains(perms);
  if (granted) return true;
  return chrome.permissions.request(perms);
};
```

- [ ] **Step 2: Guard uploadViaUserAttachments with permission check**

Wrap the `chrome.cookies.getAll` call in `uploadViaUserAttachments` (around line 53). Replace:
```ts
  // Get GitHub session cookies — use url for reliable matching across .github.com subdomains
  const cookies = await chrome.cookies.getAll({ url: 'https://github.com' });
```
with:
```ts
  // Check we have the optional cookies permission before accessing cookies API
  const hasPerms = await chrome.permissions.contains({
    permissions: ['cookies', 'declarativeNetRequest'],
  });
  if (!hasPerms) throw new Error('MISSING_PERMISSIONS');

  // Get GitHub session cookies — use url for reliable matching across .github.com subdomains
  const cookies = await chrome.cookies.getAll({ url: 'https://github.com' });
```

- [ ] **Step 3: Request permissions in finishRecording before upload attempt**

In the `finishRecording` function (around line 376), before the `uploadViaUserAttachments` call, add the permission request. Replace:
```ts
        // Try GitHub's user-attachments upload (renders inline in issues)
        let videoUrl: string | undefined;
        try {
          videoUrl = await uploadViaUserAttachments(owner, repo, filename, contentType, blob, githubPat);
```
with:
```ts
        // Try GitHub's user-attachments upload (renders inline in issues)
        // Request optional permissions first — must happen early in the gesture chain
        const hasVideoPerms = await requestVideoUploadPermissions();
        let videoUrl: string | undefined;
        try {
          if (!hasVideoPerms) throw new Error('MISSING_PERMISSIONS');
          videoUrl = await uploadViaUserAttachments(owner, repo, filename, contentType, blob, githubPat);
```

- [ ] **Step 4: Build and verify**

Run: `pnpm build`
Expected: No build errors.

- [ ] **Step 5: Commit**

```bash
git add pages/side-panel/src/views/HomeView.tsx
git commit -m "feat: request optional permissions before video upload, fallback to release assets"
```

---

### Task 4: Add Permission Check in Background Service Worker

**Files:**
- Modify: `chrome-extension/src/background/index.ts:124-169` (injectGitHubHeaders, removeHeaderRule)
- Modify: `chrome-extension/src/background/index.ts:171-237` (handleUploadVideoAttachment)

- [ ] **Step 1: Add permission guard in handleUploadVideoAttachment**

First, remove the local `POLICY_RULE_ID` and `CONFIRM_RULE_ID` constants from inside `handleUploadVideoAttachment` (lines 175-176) since they are now module-level constants (added in Task 5).

Then, at the start of the try block (line ~177), after the destructuring line, add:

```ts
    // Verify optional permissions are granted before using declarativeNetRequest
    const hasPerms = await chrome.permissions.contains({
      permissions: ['cookies', 'declarativeNetRequest'],
    });
    if (!hasPerms) {
      sendResponse({ success: false, error: 'Video upload permissions not granted' });
      return;
    }
```

- [ ] **Step 2: Build and verify**

Run: `pnpm build`
Expected: No build errors.

- [ ] **Step 3: Commit**

```bash
git add chrome-extension/src/background/index.ts
git commit -m "feat: guard declarativeNetRequest usage with optional permission check"
```

---

### Task 5: Add Fetch Timeouts

**Files:**
- Modify: `chrome-extension/src/background/index.ts` (multiple locations)
- Modify: `pages/side-panel/src/views/HomeView.tsx` (upload functions)

- [ ] **Step 1: Add fetchWithTimeout helper to background service worker**

Add after the `parseRepoName` function (around line 29), before `chrome.sidePanel.setPanelBehavior`:

```ts
/** Fetch with AbortController timeout. Throws 'Request timed out' on timeout. */
const fetchWithTimeout = (url: string, options: RequestInit = {}, timeoutMs: number): Promise<Response> => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(id));
};

const API_TIMEOUT = 30_000;
const UPLOAD_TIMEOUT = 300_000;
const TOKEN_TIMEOUT = 15_000;

// Rule IDs for declarativeNetRequest session rules (used in handleUploadVideoAttachment and onSuspend cleanup)
const POLICY_RULE_ID = 9990;
const CONFIRM_RULE_ID = 9991;
```

- [ ] **Step 2: Replace fetch calls in handleValidateToken with fetchWithTimeout**

In `handleValidateToken` (line ~401), replace:
```ts
    const response = await fetch('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${token}` },
    });
```
with:
```ts
    const response = await fetchWithTimeout('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${token}` },
    }, TOKEN_TIMEOUT);
```

- [ ] **Step 3: Replace fetch in handleCheckTokenStatus with fetchWithTimeout**

In `handleCheckTokenStatus` (line ~443), replace:
```ts
    const response = await fetch('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${githubPat}` },
    });
```
with:
```ts
    const response = await fetchWithTimeout('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${githubPat}` },
    }, TOKEN_TIMEOUT);
```

- [ ] **Step 4: Replace fetch in githubFetchStatus with fetchWithTimeout**

In `githubFetchStatus` (line ~243), replace:
```ts
  const res = await fetch(`https://api.github.com${path}`, {
    headers: { Authorization: `Bearer ${githubPat}`, Accept: 'application/vnd.github+json' },
  });
```
with:
```ts
  const res = await fetchWithTimeout(`https://api.github.com${path}`, {
    headers: { Authorization: `Bearer ${githubPat}`, Accept: 'application/vnd.github+json' },
  }, API_TIMEOUT);
```

- [ ] **Step 5: Replace fetch calls in handleUploadVideoAttachment with fetchWithTimeout**

In `handleUploadVideoAttachment`, replace the three fetch calls:

1. Policy request (line ~189):
```ts
    const policyRes = await fetchWithTimeout('https://github.com/upload/policies/assets', {
      method: 'POST',
      headers: { Accept: 'application/json' },
      body: formData,
    }, UPLOAD_TIMEOUT);
```

2. S3 upload (line ~211):
```ts
    const s3Res = await fetchWithTimeout(policy.upload_url, { method: 'POST', body: s3Form }, UPLOAD_TIMEOUT);
```

3. Confirm upload (line ~222):
```ts
    await fetchWithTimeout(`https://github.com${policy.asset_upload_url}`, {
      method: 'PUT',
      headers: { Accept: 'application/json' },
      body: confirmForm,
    }, UPLOAD_TIMEOUT);
```

- [ ] **Step 6: Add fetchWithTimeout to HomeView upload functions**

Add the same helper at the top of HomeView.tsx (after the permission helper):

```ts
const fetchWithTimeout = (url: string, options: RequestInit = {}, timeoutMs: number): Promise<Response> => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(id));
};

const API_TIMEOUT = 30_000;
const UPLOAD_TIMEOUT = 300_000;
```

Replace these specific `fetch(` calls:

In `uploadViaUserAttachments` (line ~45):
```ts
// Before:
const repoRes = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
// After:
const repoRes = await fetchWithTimeout(`https://api.github.com/repos/${owner}/${repo}`, {
  headers: { Authorization: `Bearer ${pat}`, Accept: 'application/vnd.github+json' },
}, API_TIMEOUT);
```

In `uploadViaReleaseAsset` (line ~85, release lookup):
```ts
// Before:
const releaseRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases/tags/${releaseTag}`, {
// After:
const releaseRes = await fetchWithTimeout(`https://api.github.com/repos/${owner}/${repo}/releases/tags/${releaseTag}`, {
  headers: { Authorization: `Bearer ${pat}`, Accept: 'application/vnd.github+json' },
}, API_TIMEOUT);
```

In `uploadViaReleaseAsset` (line ~91, create release):
```ts
// Before:
const createRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases`, {
// After:
const createRes = await fetchWithTimeout(`https://api.github.com/repos/${owner}/${repo}/releases`, {
```
Add `UPLOAD_TIMEOUT` as the third argument.

In `uploadViaReleaseAsset` (line ~108, upload asset):
```ts
// Before:
const uploadRes = await fetch(
// After:
const uploadRes = await fetchWithTimeout(
```
Add `UPLOAD_TIMEOUT` as the third argument.

- [ ] **Step 7: Add Octokit request timeout**

In the `getOctokit` function in background/index.ts, add a request signal using `AbortSignal.timeout()` (Octokit v22 deprecated `request.timeout`):

```ts
const getOctokit = async (): Promise<Octokit> => {
  const { githubPat } = await chrome.storage.local.get('githubPat');
  if (!githubPat) {
    throw new Error('GitHub token not configured. Go to extension options to set it up.');
  }
  return new Octokit({
    auth: githubPat,
    request: { signal: AbortSignal.timeout(API_TIMEOUT) },
  });
};
```

- [ ] **Step 8: Build and verify**

Run: `pnpm build`
Expected: No build errors.

- [ ] **Step 9: Commit**

```bash
git add chrome-extension/src/background/index.ts pages/side-panel/src/views/HomeView.tsx
git commit -m "feat: add fetch timeouts to all API and upload calls"
```

---

### Task 6: Error Classification

**Files:**
- Modify: `chrome-extension/src/background/index.ts`

- [ ] **Step 1: Add error classification function**

Add after the `fetchWithTimeout` helper:

```ts
/** Classify errors into user-friendly categories */
const classifyError = (err: unknown): { code: string; message: string } => {
  if (err instanceof DOMException && err.name === 'AbortError') {
    return { code: 'TIMEOUT', message: 'Request timed out — please try again.' };
  }
  if (err instanceof TypeError && (err.message.includes('Failed to fetch') || err.message.includes('NetworkError'))) {
    return { code: 'NETWORK', message: 'Network error — check your connection and try again.' };
  }
  const status = (err as { status?: number })?.status;
  if (status === 401) {
    return { code: 'AUTH', message: 'GitHub token expired — please enter a new token.' };
  }
  if (status === 403) {
    return { code: 'RATE_LIMIT', message: 'GitHub rate limit reached — try again in a few minutes.' };
  }
  if (status === 404) {
    return { code: 'NOT_FOUND', message: 'Resource not found — check your repository settings.' };
  }
  return {
    code: 'UNKNOWN',
    message: err instanceof Error ? err.message : 'Something went wrong.',
  };
};
```

- [ ] **Step 2: Use classifyError in key catch blocks**

Update the catch blocks in `handleCreateIssue`, `handleFetchLabels`, `handleFetchBranches`, `handleFetchRepos`, `handleFetchAssignees`, and `handleFetchPageIssues` to use `classifyError`. Pattern:

Replace:
```ts
  } catch (err) {
    await check401(err);
    sendResponse({ success: false, error: err instanceof Error ? err.message : 'Unknown error' });
  }
```
with:
```ts
  } catch (err) {
    await check401(err);
    const classified = classifyError(err);
    sendResponse({ success: false, error: classified.message });
  }
```

Apply this pattern to each handler's catch block. Do NOT change `handleCheckTokenStatus` (it has special logic for network errors).

- [ ] **Step 3: Build and verify**

Run: `pnpm build`
Expected: No build errors.

- [ ] **Step 4: Commit**

```bash
git add chrome-extension/src/background/index.ts
git commit -m "feat: add error classification for user-friendly error messages"
```

---

### Task 7: Offline Detection

**Files:**
- Create: `pages/side-panel/src/hooks/useOnlineStatus.ts`
- Modify: `pages/side-panel/src/SidePanel.tsx`

- [ ] **Step 1: Create useOnlineStatus hook**

```ts
import { useState, useEffect } from 'react';

export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return online;
}
```

- [ ] **Step 2: Add offline banner to SidePanel.tsx**

Import the hook:
```ts
import { useOnlineStatus } from './hooks/useOnlineStatus';
```

Inside the `SidePanel` component, add:
```ts
const online = useOnlineStatus();
```

Add the banner right inside the outer `<div>`, before `<div style={{ flex: 1 }}>`:

```tsx
{!online && (
  <div
    style={{
      padding: '8px 16px',
      background: 'var(--status-warning)',
      color: '#000',
      fontSize: 13,
      fontWeight: 500,
      textAlign: 'center',
    }}>
    You are offline. Connect to report issues.
  </div>
)}
```

- [ ] **Step 3: Build and verify**

Run: `pnpm build`
Expected: No build errors.

- [ ] **Step 4: Commit**

```bash
git add pages/side-panel/src/hooks/useOnlineStatus.ts pages/side-panel/src/SidePanel.tsx
git commit -m "feat: add offline detection banner in side panel"
```

---

### Task 8: Service Worker Cleanup on Suspend + Uninstall URL

**Files:**
- Modify: `chrome-extension/src/background/index.ts:31` (near top-level initialization)

- [ ] **Step 1: Add onSuspend cleanup and uninstall URL**

Add right after the `chrome.sidePanel.setPanelBehavior(...)` line:

```ts
// Clean up any leftover declarativeNetRequest session rules when service worker suspends
chrome.runtime.onSuspend.addListener(async () => {
  try {
    await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [POLICY_RULE_ID, CONFIRM_RULE_ID] });
  } catch {
    // Permission may not be granted — ignore
  }
});

// Set uninstall feedback URL
chrome.runtime.setUninstallURL('https://visual-issue-reporter.studionope.nl/uninstall-feedback');
```

Note: The `declarativeNetRequest.updateSessionRules` call is wrapped in try/catch because the permission is now optional and may not be granted.

- [ ] **Step 2: Build and verify**

Run: `pnpm build`
Expected: No build errors.

- [ ] **Step 3: Commit**

```bash
git add chrome-extension/src/background/index.ts
git commit -m "feat: add service worker onSuspend cleanup and uninstall feedback URL"
```

---

### Task 9: Final Build Verification

**Files:** None (verification only)

- [ ] **Step 1: Run full build**

```bash
pnpm build
```
Expected: Clean build, no errors.

- [ ] **Step 2: Run lint**

```bash
pnpm lint
```
Expected: No errors (warnings OK).

- [ ] **Step 3: Verify dist/manifest.json**

Check that `dist/manifest.json` contains:
- `permissions: ["activeTab", "storage", "sidePanel"]`
- `optional_permissions: ["cookies", "declarativeNetRequest"]`
- No `cookies` or `declarativeNetRequest` in the main `permissions` array

- [ ] **Step 4: Manual test checklist**

Load `dist/` as unpacked extension:
- [ ] Extension opens side panel
- [ ] Screenshot tool works on a regular webpage
- [ ] Issue creation works (no recording)
- [ ] Recording prompts for optional permissions before upload
- [ ] Denying permissions falls back to release asset upload
- [ ] Granting permissions uses user-attachments upload
- [ ] Going offline shows the banner
- [ ] Going back online hides the banner
- [ ] Network errors show clear messages (disconnect wifi, try creating issue)

- [ ] **Step 5: Commit any final fixes and push**

```bash
git push origin main
```
