# Onboarding Wizard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a two-chapter onboarding wizard modal for the Visual Issue Reporter Chrome extension — Chapter 1 (GitHub setup) auto-triggers on first launch, Chapter 2 (Claude Code setup) is independently re-enterable.

**Architecture:** Single `OnboardingWizard.tsx` component renders as a center modal overlay. `SidePanel.tsx` manages wizard open/close state and passes `onOpenWizard`/`onCloseWizard` callbacks to child views. Each step is a function component within the wizard file, selected by a `currentStep` state variable. Progress persists to `chrome.storage.local`.

**Tech Stack:** React (inline styles, no Tailwind), Chrome Extension APIs (`chrome.storage.local`, `chrome.runtime.sendMessage`), TypeScript

**Spec:** `docs/superpowers/specs/2026-03-24-onboarding-wizard-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `pages/side-panel/src/components/OnboardingWizard.tsx` | Create | Modal overlay, all 8 steps, navigation, progress dots, state management |
| `pages/side-panel/src/SidePanel.tsx` | Modify | Add wizard open/close state, render wizard, pass callbacks to views, auto-open on first launch |
| `pages/side-panel/src/views/HomeView.tsx` | Modify | Pass `onOpenWizard` to settings rows and accept prop |
| `pages/side-panel/src/views/SetupView.tsx` | Modify | Add "Setup Guide" button in auto-fix accordion, accept `onOpenWizard` prop |
| `pages/side-panel/src/views/CreateIssueView.tsx` | Modify | Add "Complete setup" button on no-workflow success screen, accept `onOpenWizard` prop |

---

### Task 1: Wizard Shell — Modal, Navigation & Progress Dots

**Files:**
- Create: `pages/side-panel/src/components/OnboardingWizard.tsx`

This task creates the empty wizard modal with backdrop, close button, progress dots, back/next navigation, and step routing. Steps render placeholder content.

- [ ] **Step 1: Create the wizard component with modal shell**

Create `OnboardingWizard.tsx` with:
- Props: `open: boolean`, `chapter: 1 | 2`, `onClose: () => void`
- State: `currentStep` (number), initialized based on `chapter` prop (chapter 1 → step 1, chapter 2 → step 5)
- Modal backdrop: fixed position, `rgba(0,0,0,0.6)`, `backdrop-filter: blur(4px)`, `z-index: 2147483647`
- Modal body: centered, `background: #1e293b`, `border-radius: 16px`, `max-width: 360px`, `width: calc(100% - 32px)`, `max-height: calc(100vh - 80px)`, `overflow-y: auto`
- X close button top-right
- Progress dots row: 8 dots total, gap between dot 4 and 5 (chapter separator), filled/outlined based on `currentStep`
- Back button (← arrow, hidden on step 1 and step 5 when chapter 2 standalone)
- Next button (purple gradient, disabled state)
- Step content area that renders placeholder `<div>Step {n}</div>` for each step
- If `!open`, return `null`

- [ ] **Step 2: Add step transition animation**

Wrap the step content in a div with `opacity` and `transition: opacity 0.2s ease`. On step change, briefly set opacity to 0, then back to 1. Use a `useEffect` on `currentStep` with a short timeout.

- [ ] **Step 3: Add progress persistence**

On `currentStep` change, save to `chrome.storage.local` key `onboardingProgress`:
```typescript
{ chapter1Complete: boolean, chapter2Complete: boolean, lastStep: number }
```
On mount, read stored progress and resume if `chapter` matches incomplete chapter.

- [ ] **Step 4: Build and verify**

Run `pnpm build`. Open the extension, verify no errors. (Wizard won't be visible yet — no entry points wired up.)

- [ ] **Step 5: Commit**

```
feat(wizard): add onboarding wizard modal shell with navigation and progress dots
```

---

### Task 2: Chapter 1 Steps — Welcome, GitHub Token, Repos, Fork

**Files:**
- Modify: `pages/side-panel/src/components/OnboardingWizard.tsx`

Implement the 4 step content components for Chapter 1.

- [ ] **Step 1: Implement WelcomeStep (step 1)**

Center-aligned content:
- Robot logo (reuse the icon or a simple purple icon container)
- Title: "Welcome to Visual Issue Reporter"
- Subtitle: "Report visual issues directly from any website. Let's get you connected in 2 minutes."
- "Get Started" button (purple gradient) that calls `goNext()`
- Hide the bottom navigation bar on this step (the CTA replaces it)

- [ ] **Step 2: Implement ConnectGitHubStep (step 2)**

- Title: "Connect your GitHub account"
- Description with link to create classic token
- Password input + Validate button (reuse `inputStyle`/`buttonStyle` patterns from SetupView)
- Status display: validating spinner, green "Connected as {user}", error message
- Use `chrome.runtime.sendMessage({ type: 'VALIDATE_TOKEN', payload: { token } })` for validation
- `canProceed` = `patStatus === 'valid'` — controls Next button disabled state

- [ ] **Step 3: Implement AddReposStep (step 3)**

- Title: "Select repositories"
- Searchable input that fetches repos via `chrome.runtime.sendMessage({ type: 'FETCH_REPOS' })`
- Dropdown list of matching repos (same pattern as SetupView repo picker)
- Added repos list with remove buttons
- Save to `chrome.storage.local` on add/remove: `repoList`, `selectedRepo`
- `canProceed` = `repos.length > 0`

- [ ] **Step 4: Implement EnableClaudeStep (step 4)**

- Title: "Enable auto-fix with Claude Code?"
- Description of what it does
- Two buttons side by side:
  - "Skip for now" → calls `onClose()` (wizard closes, chapter1Complete = true)
  - "Yes, set it up" → sets `currentStep` to 5 (enters Chapter 2), marks chapter1Complete
- Hide bottom navigation bar on this step (custom buttons replace it)

- [ ] **Step 5: Build and verify**

`pnpm build` — no errors.

- [ ] **Step 6: Commit**

```
feat(wizard): implement Chapter 1 steps — welcome, GitHub token, repos, fork
```

---

### Task 3: Chapter 2 Steps — Anthropic Key, Secrets, Workflow, Done

**Files:**
- Modify: `pages/side-panel/src/components/OnboardingWizard.tsx`

Implement the 4 step content components for Chapter 2.

- [ ] **Step 1: Implement ConnectAnthropicStep (step 5)**

- Title: "Connect Anthropic"
- Description with link to console.anthropic.com
- Password input + Validate button
- Validate against `https://api.anthropic.com/v1/models` (same logic as SetupView `validateAnthropicKey`)
- On success, save to `chrome.storage.local` as `autoFixSettings`
- Status: green "Connected", error message
- `canProceed` = key validated

- [ ] **Step 2: Implement AddSecretsStep (step 6)**

- Title: "Add API key to your repos"
- Description explaining the ANTHROPIC_API_KEY secret
- "Copy API key" button with copied feedback (green checkmark, "Copied!")
- Per-repo list: each shows status dot (green/red/gray), repo name, "Add secret →" link (opens GitHub) or "Ready" text
- "Re-check" underlined link at bottom
- Uses `CHECK_REPO_SECRET` message for each repo
- `canProceed` = always true (partial setup OK). Next button text = all green ? "Next" : "Continue anyway"

- [ ] **Step 3: Implement AddWorkflowStep (step 7)**

- Title: "Add the workflow file"
- Description
- Copyable YAML block (the workflow template from the spec's `AUTO_FIX_WORKFLOW` constant — hardcoded in the component since it was removed from background.ts)
- "Copy YAML" button with copied feedback
- Per-repo list with workflow status (uses `CHECK_REPO_WORKFLOW`), "Add workflow →" links to `https://github.com/{repo}/new/main?filename=.github/workflows/visual-issue-claude-fix.yml`
- "Re-check" link
- `canProceed` = always true. Same "Continue anyway" pattern.

- [ ] **Step 4: Implement DoneStep (step 8)**

- Green checkmark icon in container
- Title: "You're all set!"
- Subtitle: "Claude Code will automatically analyze issues and open PRs with fixes."
- "Start Reporting" button (purple gradient) → calls `onClose()`, marks chapter2Complete
- Hide bottom navigation bar

- [ ] **Step 5: Build and verify**

`pnpm build` — no errors.

- [ ] **Step 6: Commit**

```
feat(wizard): implement Chapter 2 steps — Anthropic key, secrets, workflow, done
```

---

### Task 4: Wire Up Entry Points

**Files:**
- Modify: `pages/side-panel/src/SidePanel.tsx`
- Modify: `pages/side-panel/src/views/HomeView.tsx`
- Modify: `pages/side-panel/src/views/SetupView.tsx`
- Modify: `pages/side-panel/src/views/CreateIssueView.tsx`

Connect the wizard to all 4 entry points.

- [ ] **Step 1: Add wizard state to SidePanel.tsx**

Add state:
```typescript
const [wizardOpen, setWizardOpen] = useState(false);
const [wizardChapter, setWizardChapter] = useState<1 | 2>(1);
```

Add handler:
```typescript
const openWizard = (chapter: 1 | 2) => {
  setWizardChapter(chapter);
  setWizardOpen(true);
};
```

Change the first-launch check: instead of `setView('setup')`, call `openWizard(1)`.

Render `<OnboardingWizard open={wizardOpen} chapter={wizardChapter} onClose={() => setWizardOpen(false)} />` at the end of the component (after footer), so it overlays everything.

- [ ] **Step 2: Pass onOpenWizard to HomeView**

Add `onOpenWizard` prop to `HomeViewProps`. Pass `openWizard` from SidePanel.

In HomeView, when "Auto-fix with Claude Code" settings row is clicked and status is not "ready", call `onOpenWizard(2)` instead of `onOpenSettings('autofix')`.

- [ ] **Step 3: Pass onOpenWizard to SetupView**

Add `onOpenWizard` prop to `SetupViewProps`. Pass `openWizard` from SidePanel.

In the Auto-fix accordion, add a "Setup Guide" button:
```typescript
<button onClick={() => onOpenWizard?.(2)} style={{...underlinedLinkStyle}}>
  Open setup guide
</button>
```

- [ ] **Step 4: Pass onOpenWizard to CreateIssueView**

Add `onOpenWizard` prop to `CreateIssueViewProps`. Pass `openWizard` from SidePanel.

On the success screen, when `autoFixResult === 'no-workflow'`, add:
```typescript
<button onClick={() => onOpenWizard?.(2)} style={{...underlinedLinkStyle}}>
  Complete setup
</button>
```

- [ ] **Step 5: Build and test all entry points**

`pnpm build`. Reload extension. Test:
1. Clear storage → first launch opens Chapter 1 wizard
2. Settings → Auto-fix row opens Chapter 2 wizard
3. "Setup Guide" button in Auto-fix accordion opens Chapter 2
4. Submit issue with auto-fix on repo without workflow → success screen shows "Complete setup"

- [ ] **Step 6: Commit**

```
feat(wizard): wire up all 4 entry points for onboarding wizard
```

---

### Task 5: Polish & Edge Cases

**Files:**
- Modify: `pages/side-panel/src/components/OnboardingWizard.tsx`
- Modify: `pages/side-panel/src/SidePanel.tsx`

- [ ] **Step 1: Handle wizard close with progress save**

When X is clicked mid-wizard, save current step to `onboardingProgress` in storage. On next open, if the chapter matches and isn't complete, resume from saved step.

- [ ] **Step 2: Handle chapter 2 standalone entry**

When opening Chapter 2 directly (from entry points 2/3/4), skip steps 1-4. Set initial step to 5. Progress dots should only show Chapter 2 dots (5-8). Back button on step 5 should close the wizard (not go to step 4).

- [ ] **Step 3: Sync wizard completion with existing Settings**

After Chapter 1 completes: the accordion defaults in SetupView should recognize the token/repos are configured (already works via storage).

After Chapter 2 completes: the auto-fix status in HomeView should update. Call a refresh or re-read storage when wizard closes.

- [ ] **Step 4: Keyboard support**

- Escape key closes the wizard
- Enter key triggers Next/Validate when focused

- [ ] **Step 5: Final build and full test**

`pnpm build`. Full test of all flows:
- First launch → Chapter 1 → Skip → HomeView
- First launch → Chapter 1 → Yes → Chapter 2 → Done
- Settings → Chapter 2 standalone → Done
- Success screen → Chapter 2 → Done
- Close mid-wizard → reopen → resumes

- [ ] **Step 6: Commit**

```
feat(wizard): polish — progress persistence, standalone chapter 2, keyboard support
```
