# Permissions Justification

For Chrome Web Store review.

## activeTab
**Why needed:** To capture a screenshot of the visible tab when the user clicks "Report Issue". The extension uses `chrome.tabs.captureVisibleTab()` which requires this permission.

**User benefit:** Allows users to capture exactly what they see on screen for accurate bug reports.

## storage
**Why needed:** To persist user settings including:
- GitHub Personal Access Token (for API authentication)
- List of configured repositories
- Selected repository preference

**User benefit:** Settings persist across browser sessions so users don't need to reconfigure each time.

## Host permissions (<all_urls>)
**Why needed:** The extension needs to:
1. Inject content scripts on any page to show the screenshot overlay and annotation tools
2. Work on any website the user wants to report issues from (internal tools, staging sites, production sites)

**User benefit:** Users can report visual issues on ANY website they're working with, not just a predefined list. This is essential for QA teams, designers, and developers who work across many different domains.

## Remote Code
**None.** All code is bundled in the extension. No remote scripts are loaded.

## Data Handling
- No data sent to extension developer
- GitHub token stored locally in Chrome sync storage
- Screenshots sent directly to GitHub API (user's own account)
- No analytics or tracking
