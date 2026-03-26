# Chrome Web Store Submission Readiness

**Date:** 2026-03-26
**Status:** Draft
**Author:** Claude + Tijs

## Context

Visual Issue Reporter is a Chrome MV3 extension that lets anyone report visual issues directly to GitHub with annotated screenshots and screen recordings. It's ready for public distribution via the Chrome Web Store. This spec covers the code and content changes needed to pass Google's review process.

The developer account is set up, promotional assets are ready, and a privacy policy is hosted at https://visual-issue-reporter.studionope.nl/privacy.

## Goals

1. Pass Chrome Web Store review on first submission
2. Minimize permission footprint to reduce review scrutiny
3. Ensure the extension handles errors gracefully (broken functionality = rejection)
4. Prepare all store listing text in Dutch, ready to copy-paste into the dashboard

## Non-Goals

- Changing core functionality
- Adding new features
- Redesigning UI
- Creating promotional images or videos (already done)

## Key Risks

### `<all_urls>` Host Permission

This is the single biggest review risk. Google flags `<all_urls>` for extended review because it grants access to all websites. However, it is unavoidable for this extension:

- Content scripts must inject on any page (the user can report issues on any website)
- `chrome.tabs.captureVisibleTab()` needs host access for screenshots
- `chrome.tabs.sendMessage()` needs access to communicate with content scripts

`activeTab` alone cannot replace `<all_urls>` because content scripts require static match patterns in the manifest. The mitigation strategy is strong justification in the Single Purpose Declaration and permission justifications. The extension's purpose (visual bug reporting on any website) is a legitimate use case for broad host permissions.

### Localization Strategy

The manifest `default_locale` is `en` and the extension UI strings are in English. The store listing will be in Dutch. These are separate: the extension itself stays English, only the Chrome Web Store dashboard text is Dutch. This is standard practice for extensions targeting a Dutch audience with an English UI. Existing English error messages in the codebase remain English. The new error messages from Section 5 will also be English in code (consistent with the existing codebase), while the store listing text in Section 2 is Dutch.

### Privacy Policy Verification

The privacy policy at https://visual-issue-reporter.studionope.nl/privacy must cover:
- [ ] What data is collected (GitHub PAT, session cookies, screenshots, recordings)
- [ ] How cookies are used (GitHub session cookies for video upload only)
- [ ] Where data is sent (only to the user's own GitHub repository)
- [ ] Data retention (tokens stored locally, no server-side storage)
- [ ] Third parties (GitHub only, no analytics or tracking)

This checklist should be verified before submission.

---

## 1. Optional Permissions for Video Upload

### Problem

The manifest requests `cookies` and `declarativeNetRequest` as required permissions. These trigger extended review because they're classified as "sensitive." However, they're only used for the video upload feature (GitHub user-attachments API), not for core screenshot/issue functionality.

### Design

Move `cookies` and `declarativeNetRequest` from `permissions` to `optional_permissions` in the manifest.

**Manifest change:**

```ts
// Before
permissions: ['activeTab', 'storage', 'sidePanel', 'cookies', 'declarativeNetRequest']

// After
permissions: ['activeTab', 'storage', 'sidePanel'],
optional_permissions: ['cookies', 'declarativeNetRequest']
```

**Runtime permission flow:**

Permission requesting can only happen in the UI context (side panel), not in the background service worker. The request must be called synchronously from a user gesture (click handler) or it will silently fail.

When the user triggers a video upload in HomeView:

1. Call `chrome.permissions.contains({ permissions: ['cookies', 'declarativeNetRequest'] })`
2. If granted, proceed with user-attachments upload as-is
3. If not granted, call `chrome.permissions.request(...)` immediately in the click handler (before any async work)
4. If the user grants, proceed with user-attachments upload
5. If the user denies, fall back to the existing release-asset upload path (already implemented)

The `chrome.cookies.getAll()` call in HomeView (line ~53) must also be guarded — it will throw if `cookies` permission hasn't been granted.

The background service worker can only call `chrome.permissions.contains()` to check, not `chrome.permissions.request()`. If the background receives an upload request without permissions, it returns an error telling the side panel to request them.

**Files affected:**
- `chrome-extension/manifest.ts` — move permissions
- `pages/side-panel/src/views/HomeView.tsx` — add permission request (in click handler) and guard `chrome.cookies.getAll()`
- `chrome-extension/src/background/index.ts` — add permission check (contains only) in `handleUploadVideoAttachment`

**Fallback behavior:** The extension already has a two-tier upload system. User-attachments (inline video) is preferred, release assets (download link) is the fallback. Denying optional permissions simply skips to the fallback.

---

## 2. Store Listing Text (Dutch)

All text will be saved to `docs/chrome-web-store/listing-nl.md` for easy copy-paste into the dashboard.

### Detailed Description (Dutch)

A clear explanation of what the extension does, features, target audience, and how it works. Written in Dutch without hyphens. Covers:
- What: visual bug reporting to GitHub
- How: screenshots with annotations, screen recording with mic
- Who: developers, QA teams, project managers
- Privacy: data goes only to the user's own GitHub repository

### Single Purpose Declaration

One sentence in Dutch: the extension reports visual issues on any webpage directly to GitHub with annotated screenshots and screen recordings.

### Permission Justifications

One sentence per permission explaining why it's needed:
- `activeTab` — capture screenshots and communicate with the current page
- `storage` — store GitHub token and user preferences locally
- `sidePanel` — display the issue reporting form
- `host_permissions: <all_urls>` — the extension must work on any website the user visits
- `cookies` (optional) — read GitHub session cookies for inline video embedding
- `declarativeNetRequest` (optional) — inject authentication headers for video upload

**File created:** `docs/chrome-web-store/listing-nl.md`

---

## 3. Fetch Timeouts

### Problem

No fetch calls in the extension have timeouts. A stalled request leaves the UI frozen with no feedback, which Google may flag as broken functionality.

### Design

Add `AbortController` with timeouts to all fetch and Octokit calls:

| Call type | Timeout | Location |
|-----------|---------|----------|
| GitHub API (repos, branches, labels, issues) | 30 seconds | Background service worker |
| Token validation | 15 seconds | Background service worker |
| Video upload (user-attachments) | 5 minutes | HomeView + background |
| Video upload (release assets) | 5 minutes | Background service worker |
| Screenshot URL resolution | 10 seconds | Background service worker (already has this) |

**Implementation:** Create a small helper:

```ts
function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(id));
}
```

For Octokit calls, pass `request: { signal: controller.signal }` in the options.

**Error handling:** When `AbortError` is caught, return a specific timeout error message to the UI so it can show "Request timed out" instead of a generic error.

**Files affected:**
- `chrome-extension/src/background/index.ts`
- `pages/side-panel/src/views/HomeView.tsx`

---

## 4. Offline Detection

### Problem

When the user is offline, API calls fail silently or show generic errors. The side panel doesn't indicate connectivity status.

### Design

Add offline awareness to the side panel:

1. **Check `navigator.onLine`** on mount and listen for `online`/`offline` events
2. **Show a banner** at the top of the side panel when offline: "Je bent offline. Maak verbinding om issues te melden." (or similar)
3. **Disable action buttons** (Create Issue, Start Recording upload) when offline
4. **Re-enable automatically** when the `online` event fires

This is a lightweight addition to the side panel's root component or a shared hook.

**Files affected:**
- `pages/side-panel/src/SidePanel.tsx` or a new `useOnlineStatus.ts` hook
- Minimal CSS for the offline banner

**Not in scope:** Offline queuing or retry. If the user goes offline mid-upload, the error handling from Section 3 covers it with a clear timeout message.

**Note:** `navigator.onLine` is unreliable on captive portals (returns `true` with no internet). The fetch timeouts from Section 3 serve as the real fallback for "connected but no internet" scenarios. The offline banner is a UX convenience, not a guarantee.

---

## 5. Improved Error Messages

### Problem

Most error states show generic messages. Google reviewers test extensions and expect clear feedback when things go wrong.

### Design

Distinguish between these error categories in the UI:

| Error type | Detection | User message (Dutch) |
|-----------|-----------|---------------------|
| Offline | `!navigator.onLine` | "Je bent offline" |
| Timeout | `AbortError` | "Verzoek duurt te lang, probeer het opnieuw" |
| Auth expired | 401 status | "GitHub token is verlopen, voer een nieuw token in" |
| Rate limited | 403 + rate limit headers | "GitHub limiet bereikt, probeer het later opnieuw" |
| Generic | Everything else | "Er ging iets mis: [error message]" |

**Implementation:** Add an error classification function in the background service worker that maps errors to typed responses. The side panel already renders error messages from responses, so it just needs to display what it receives.

**Files affected:**
- `chrome-extension/src/background/index.ts` — error classification
- Side panel views — display improved messages (minimal changes, mostly already handled)

---

## 6. Uninstall Feedback URL

### Design

Add one line to the background service worker's initialization:

```ts
chrome.runtime.setUninstallURL('https://visual-issue-reporter.studionope.nl/uninstall-feedback');
```

The landing page at that URL is out of scope for this plan (will be created later on the website).

**Files affected:**
- `chrome-extension/src/background/index.ts`

---

## 7. Service Worker Cleanup on Suspend

### Problem

If the service worker is terminated mid-upload, `declarativeNetRequest` session rules (which inject Cookie/Origin/Referer headers) may be left in place.

### Design

Add a `chrome.runtime.onSuspend` listener that cleans up any active session rules:

```ts
chrome.runtime.onSuspend.addListener(async () => {
  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: [UPLOAD_RULE_ID]
  });
});
```

This is a safety net. Session rules are already cleaned up in the normal flow's `finally` block.

**Files affected:**
- `chrome-extension/src/background/index.ts`

---

## Implementation Order

1. **Store listing text** — forces clear articulation of permission justifications, informs other work
2. **Optional permissions** — largest code change, reduces review risk
3. **Fetch timeouts** — foundational for error handling
4. **Error message classification** — builds on timeouts
5. **Offline detection** — builds on error handling patterns
6. **Service worker cleanup** — safety net for declarativeNetRequest rules
7. **Uninstall URL** — one-liner, do last

## Testing Strategy

- Load unpacked extension from `dist/`
- Test issue creation flow with and without optional permissions granted
- Test video upload with permissions granted (user-attachments path)
- Test video upload with permissions denied (release-asset fallback)
- Test with network throttling / offline mode in DevTools
- Verify all error messages display correctly in Dutch
- Run `pnpm build && pnpm lint` before submission
