import 'webextension-polyfill';
import { Octokit } from '@octokit/rest';
import type {
  AutoFixSettings,
  CheckTokenStatusResponse,
  CreateIssueMessage,
  ExtensionMessage,
  FetchAssigneesMessage,
  FetchAssigneesResponse,
  FetchLabelsMessage,
  FetchLabelsResponse,
  FetchPageIssuesMessage,
  FetchPageIssuesResponse,
  FetchReposResponse,
  MessageResponse,
  PageIssue,
  ShowIssuesPanelMessage,
  ShowScreenshotMessage,
  ValidateTokenMessage,
  ValidateTokenResponse,
} from '@extension/shared';

/** Validates that a string matches the `owner/repo` format */
const REPO_NAME_REGEX = /^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/;

const parseRepoName = (repo: string): { owner: string; repo: string } | null => {
  if (!REPO_NAME_REGEX.test(repo)) return null;
  const [owner, name] = repo.split('/');
  return { owner, repo: name };
};

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);

chrome.runtime.onMessage.addListener(
  (message: ExtensionMessage, sender, sendResponse: (response: MessageResponse | FetchPageIssuesResponse) => void) => {
    // Only accept messages from our own extension
    if (sender.id !== chrome.runtime.id) return false;

    if (message.type === 'ACTIVATE_TOOL') {
      handleStartReport(message.payload.tool, sendResponse);
      return true;
    }
    if (message.type === 'CREATE_ISSUE') {
      handleCreateIssue(message, sendResponse);
      return true;
    }
    if (message.type === 'FETCH_PAGE_ISSUES') {
      handleFetchPageIssues(message, sendResponse as (response: FetchPageIssuesResponse) => void);
      return true;
    }
    if (message.type === 'FETCH_LABELS') {
      handleFetchLabels(message, sendResponse as (response: FetchLabelsResponse) => void);
      return true;
    }
    if (message.type === 'FETCH_ASSIGNEES') {
      handleFetchAssignees(message, sendResponse as (response: FetchAssigneesResponse) => void);
      return true;
    }
    if (message.type === 'FETCH_REPOS') {
      handleFetchRepos(sendResponse as (response: FetchReposResponse) => void);
      return true;
    }
    if (message.type === 'VALIDATE_TOKEN') {
      handleValidateToken(message, sendResponse as (response: ValidateTokenResponse) => void);
      return true;
    }
    if (message.type === 'REMOVE_TOKEN') {
      handleRemoveToken(sendResponse);
      return true;
    }
    if (message.type === 'CHECK_TOKEN_STATUS') {
      handleCheckTokenStatus(sendResponse as (response: CheckTokenStatusResponse) => void);
      return true;
    }
    if (message.type === 'REQUEST_CAPTURE') {
      // Forward to the active tab's content-UI
      chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
        if (tab?.id) {
          chrome.tabs.sendMessage(tab.id, { type: 'REQUEST_CAPTURE' }).catch(() => {});
        }
      });
      return false;
    }
    if (message.type === 'SHOW_ISSUES_PANEL') {
      handleShowIssuesPanel(message);
      return true;
    }
    return false;
  },
);

const handleStartReport = async (tool: 'select' | 'pencil', sendResponse: (response: MessageResponse) => void) => {
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

    const screenshotDataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'jpeg', quality: 80 });

    const payload: ShowScreenshotMessage = {
      type: 'SHOW_SCREENSHOT',
      payload: { screenshotDataUrl, tool },
    };

    await chrome.tabs.sendMessage(tab.id, payload);
    // Also notify side panel that overlay is opening
    chrome.runtime.sendMessage({ type: 'OVERLAY_OPENED' }).catch(() => {});
    sendResponse({ success: true });
  } catch (err) {
    sendResponse({ success: false, error: err instanceof Error ? err.message : 'Unknown error' });
  }
};

const getOctokit = async (): Promise<Octokit> => {
  const { githubPat } = await chrome.storage.local.get('githubPat');
  if (!githubPat) {
    throw new Error('GitHub token not configured. Go to extension options to set it up.');
  }
  return new Octokit({ auth: githubPat });
};

const getRepoConfig = async (): Promise<{ owner: string; repo: string }> => {
  const { selectedRepo } = await chrome.storage.local.get('selectedRepo');
  const parsed = selectedRepo ? parseRepoName(selectedRepo) : null;
  if (!parsed) {
    throw new Error('No repository selected. Go to extension options to configure.');
  }
  return parsed;
};

// In-memory cache of recently created issues so they appear immediately
// in fetch results even before GitHub's API has indexed them.
const MAX_CACHE_SIZE = 50;
const recentIssuesCache: Map<string, PageIssue> = new Map();

const handleValidateToken = async (
  message: ValidateTokenMessage,
  sendResponse: (response: ValidateTokenResponse) => void,
) => {
  try {
    const token = message.payload.token;
    if (!token || typeof token !== 'string') {
      sendResponse({ success: false, error: 'Invalid token' });
      return;
    }
    const response = await fetch('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (response.ok) {
      const user = (await response.json()) as { login: string };
      await chrome.storage.local.set({ githubPat: token, githubPatUser: user.login });
      sendResponse({ success: true, login: user.login });
    } else {
      sendResponse({ success: false, error: 'Invalid token — check scopes and try again.' });
    }
  } catch {
    sendResponse({ success: false, error: 'Token validation failed.' });
  }
};

const handleRemoveToken = async (sendResponse: (response: MessageResponse) => void) => {
  await chrome.storage.local.remove(['githubPat', 'githubPatUser', 'repoList', 'selectedRepo']);
  recentIssuesCache.clear();
  sendResponse({ success: true });
};

const handleCheckTokenStatus = async (sendResponse: (response: CheckTokenStatusResponse) => void) => {
  const { githubPat, githubPatUser } = await chrome.storage.local.get(['githubPat', 'githubPatUser']);
  sendResponse({
    connected: !!githubPat,
    login: (githubPatUser as string) || undefined,
  });
};

const RELEASE_TAG = 'visual-issues';

const detectEnvironment = (url: string): string => {
  try {
    const parsed = new URL(url);
    const { hostname } = parsed;
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]' || hostname.endsWith('.local')) {
      return 'local';
    }
    if (parsed.pathname.includes('/admin/') || hostname === 'admin.shopify.com') {
      return 'editor';
    }
    if (parsed.searchParams.has('preview_theme_id')) {
      return 'preview';
    }
    return 'live';
  } catch {
    return 'unknown';
  }
};

const getOrCreateScreenshotRelease = async (octokit: Octokit, owner: string, repo: string): Promise<number> => {
  // Use listReleases instead of getReleaseByTag to avoid noisy 404 errors
  const { data: releases } = await octokit.repos.listReleases({ owner, repo, per_page: 100 });
  const existing = releases.find(r => r.tag_name === RELEASE_TAG);
  if (existing) return existing.id;

  const { data } = await octokit.repos.createRelease({
    owner,
    repo,
    tag_name: RELEASE_TAG,
    name: 'Visual Issue Screenshots',
    body: 'Screenshots uploaded by Visual Issue Reporter. Do not delete this release.',
  });
  return data.id;
};

const dataUrlToArrayBuffer = (dataUrl: string): ArrayBuffer => {
  const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '');
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
};

const handleCreateIssue = async (message: CreateIssueMessage, sendResponse: (response: MessageResponse) => void) => {
  try {
    const octokit = await getOctokit();
    const { owner, repo } = await getRepoConfig();
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
      browserMetadata,
      autoFix,
    } = message.payload;

    const releaseId = await getOrCreateScreenshotRelease(octokit, owner, repo);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `issue-${timestamp}.jpg`;

    const asset = await octokit.repos.uploadReleaseAsset({
      owner,
      repo,
      release_id: releaseId,
      name: filename,
      // @ts-expect-error — Octokit types expect string but ArrayBuffer works at runtime
      data: dataUrlToArrayBuffer(annotatedScreenshotDataUrl),
      headers: { 'content-type': 'image/jpeg' },
    });

    const screenshotUrl = asset.data.browser_download_url;

    const pagePath = (() => {
      try {
        return new URL(pageUrl).pathname;
      } catch {
        return pageUrl;
      }
    })();

    const hostname = (() => {
      try {
        return new URL(pageUrl).hostname;
      } catch {
        return '';
      }
    })();

    const themeId = (() => {
      try {
        return new URL(pageUrl).searchParams.get('preview_theme_id') ?? '';
      } catch {
        return '';
      }
    })();

    const environment = detectEnvironment(pageUrl);

    let body = '';

    body += `## Screenshot\n![Screenshot](${screenshotUrl})\n\n`;
    body += `## Description\n${description}\n\n`;
    body += `## Details\n`;
    body += `- **Page:** [${pageUrl}](${pageUrl})\n`;
    const shopify = browserMetadata?.shopify;
    if (shopify) {
      body += `- **Store:** ${shopify.storeName} (${shopify.storeHandle})\n`;
      body += `- **Environment:** ${shopify.environment}\n`;
      if (shopify.template) body += `- **Template:** ${shopify.template}\n`;
      if (shopify.themeName) body += `- **Theme:** ${shopify.themeName}\n`;
      if (shopify.themeId) body += `- **Theme ID:** ${shopify.themeId}\n`;
      if (shopify.editorUrl) body += `- **Editor:** [Open in Theme Editor](${shopify.editorUrl})\n`;
      if (shopify.locale) body += `- **Locale:** ${shopify.locale}\n`;
    } else {
      body += `- **Store:** ${hostname}\n`;
      body += `- **Environment:** ${environment}\n`;
      if (template) body += `- **Template:** ${template}\n`;
      if (themeId) body += `- **Theme ID:** ${themeId}\n`;
    }
    body += `- **Viewport:** ${viewportWidth} x ${viewportHeight}\n`;
    if (region) {
      body += `- **Region:** x:${Math.round(region.x)}, y:${Math.round(region.y)}, width:${Math.round(region.width)}, height:${Math.round(region.height)}\n`;
    }

    // Environment section
    if (browserMetadata) {
      body += `\n## Environment\n`;
      body += `- **Browser:** ${browserMetadata.browser.name} ${browserMetadata.browser.version} (${browserMetadata.browser.engine})\n`;
      body += `- **OS:** ${browserMetadata.os.name} ${browserMetadata.os.version}\n`;
      body += `- **Device:** ${browserMetadata.device.type} (${browserMetadata.device.screenWidth}x${browserMetadata.device.screenHeight} @${browserMetadata.device.pixelRatio}x)\n`;
      body += `- **Viewport:** ${viewportWidth}x${viewportHeight}\n`;
      body += `- **Zoom:** ${browserMetadata.page.zoomLevel}%\n`;
      body += `- **Color Scheme:** ${browserMetadata.device.colorScheme}\n`;
      body += `- **Page Title:** ${browserMetadata.page.title}\n`;
      body += `- **Language:** ${browserMetadata.page.language}\n`;
      body += `- **Connection:** ${browserMetadata.network.online ? 'online' : 'offline'}${browserMetadata.network.connectionType ? ` (${browserMetadata.network.connectionType})` : ''}\n`;
    }

    // Console Errors section
    if (browserMetadata?.consoleErrors && browserMetadata.consoleErrors.length > 0) {
      body += `\n## Console Errors\n\`\`\`log\n`;
      for (const err of browserMetadata.consoleErrors) {
        const time = new Date(err.timestamp).toLocaleTimeString();
        body += `[${err.level}] ${time} — ${err.message}\n`;
      }
      body += `\`\`\`\n`;
    }

    if (htmlSnippet) {
      body += `\n## HTML Snippet\n\`\`\`html\n${htmlSnippet}\n\`\`\`\n`;
    }
    body += `\n## Analysis\n`;
    body += `> Tag \`@claude\` in a comment to analyze this issue against the codebase.\n`;
    body += `\n---\n*Reported via [Visual Issue Reporter](https://github.com/N-O-P-E/visual-issue-reporter)*\n`;

    const title = `[Visual] ${description.slice(0, 80)}${description.length > 80 ? '...' : ''}`;

    const issueLabels = ['visual-issue', ...(userLabels ?? [])];
    const issue = await octokit.issues.create({
      owner,
      repo,
      title,
      body,
      labels: issueLabels,
      ...(assignee ? { assignees: [assignee] } : {}),
    });

    // Cache the created issue so it appears immediately in fetch results
    const cacheKey = `${hostname}:${pagePath}`;
    if (recentIssuesCache.size >= MAX_CACHE_SIZE) {
      const oldestKey = recentIssuesCache.keys().next().value;
      if (oldestKey) recentIssuesCache.delete(oldestKey);
    }
    recentIssuesCache.set(cacheKey, {
      number: issue.data.number,
      title,
      state: 'open',
      html_url: issue.data.html_url,
      created_at: new Date().toISOString(),
      description: description.trim(),
      screenshot_url: screenshotUrl,
    });

    // Handle auto-fix with Claude
    if (autoFix) {
      try {
        await setupAutoFix(octokit, owner, repo, issue.data.number);
      } catch (autoFixErr) {
        // Log but don't fail the issue creation
        console.error('Auto-fix setup failed:', autoFixErr);
      }
    }

    sendResponse({
      success: true,
      issueUrl: issue.data.html_url,
      issueNumber: issue.data.number,
    });
  } catch (err) {
    sendResponse({ success: false, error: err instanceof Error ? err.message : 'Unknown error' });
  }
};

// Auto-fix with Claude workflow template
const AUTO_FIX_WORKFLOW = `name: Claude Auto-Fix

on:
  issues:
    types: [labeled]

permissions:
  contents: write
  pull-requests: write
  issues: write

jobs:
  auto-fix:
    if: github.event.label.name == 'auto-fix'
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Run Claude
        uses: anthropics/claude-code-action@v1
        with:
          anthropic_api_key: \${{ secrets.ANTHROPIC_API_KEY }}
          prompt: |
            You are an AI assistant that fixes visual issues reported via the Visual Issue Reporter extension.

            When you receive an issue:
            1. Read the issue description and examine any attached screenshot
            2. The purple highlighted area shows the problem location
            3. Identify the relevant code files
            4. Create a minimal fix that addresses only the reported issue
            5. Open a PR with your changes

            Keep changes minimal. Don't refactor. Don't add features. Just fix the reported issue.
`;

const setupAutoFix = async (octokit: Octokit, owner: string, repo: string, issueNumber: number): Promise<void> => {
  // 1. Ensure the auto-fix label exists
  try {
    await octokit.issues.getLabel({ owner, repo, name: 'auto-fix' });
  } catch {
    // Label doesn't exist, create it
    await octokit.issues.createLabel({
      owner,
      repo,
      name: 'auto-fix',
      color: 'a78bfa',
      description: 'Auto-fix with Claude AI',
    });
  }

  // 2. Ensure the GitHub Action workflow exists
  const workflowPath = '.github/workflows/claude-auto-fix.yml';
  try {
    await octokit.repos.getContent({ owner, repo, path: workflowPath });
    // Workflow exists, no need to create
  } catch {
    // Workflow doesn't exist, try to create it
    try {
      // Get the default branch
      const { data: repoData } = await octokit.repos.get({ owner, repo });
      const defaultBranch = repoData.default_branch;

      // Get the custom system prompt if set
      const { autoFixSettings } = await chrome.storage.local.get('autoFixSettings');
      let workflowContent = AUTO_FIX_WORKFLOW;
      if (autoFixSettings?.systemPrompt) {
        // Replace the default prompt with custom one
        workflowContent = workflowContent.replace(
          /prompt: \|[\s\S]*$/,
          `prompt: |\n            ${(autoFixSettings as AutoFixSettings).systemPrompt?.split('\n').join('\n            ')}\n`,
        );
      }

      await octokit.repos.createOrUpdateFileContents({
        owner,
        repo,
        path: workflowPath,
        message: 'Add Claude auto-fix workflow',
        content: btoa(workflowContent),
        branch: defaultBranch,
      });
    } catch (createErr) {
      console.error('Failed to create workflow file:', createErr);
      // Continue anyway - user may need to add manually
    }
  }

  // 3. Add the auto-fix label to trigger the action
  await octokit.issues.addLabels({
    owner,
    repo,
    issue_number: issueNumber,
    labels: ['auto-fix'],
  });
};

const handleFetchLabels = async (
  message: FetchLabelsMessage,
  sendResponse: (response: FetchLabelsResponse) => void,
) => {
  try {
    const parsed = parseRepoName(message.payload.repo);
    if (!parsed) {
      sendResponse({ success: false, error: 'Invalid repository name format.' });
      return;
    }
    const octokit = await getOctokit();
    const { data } = await octokit.issues.listLabelsForRepo({
      owner: parsed.owner,
      repo: parsed.repo,
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

const handleFetchRepos = async (sendResponse: (response: FetchReposResponse) => void) => {
  try {
    const octokit = await getOctokit();
    const repos: Array<{ full_name: string; description: string | null }> = [];
    // Fetch repos the user has access to (up to 200)
    for (let page = 1; page <= 2; page++) {
      const { data } = await octokit.repos.listForAuthenticatedUser({
        per_page: 100,
        sort: 'updated',
        direction: 'desc',
        page,
      });
      repos.push(...data.map(r => ({ full_name: r.full_name, description: r.description })));
      if (data.length < 100) break;
    }
    sendResponse({ success: true, repos });
  } catch (err) {
    sendResponse({ success: false, error: err instanceof Error ? err.message : 'Unknown error' });
  }
};

const handleFetchAssignees = async (
  message: FetchAssigneesMessage,
  sendResponse: (response: FetchAssigneesResponse) => void,
) => {
  try {
    const parsed = parseRepoName(message.payload.repo);
    if (!parsed) {
      sendResponse({ success: false, error: 'Invalid repository name format.' });
      return;
    }
    const octokit = await getOctokit();
    const { data } = await octokit.issues.listAssignees({
      owner: parsed.owner,
      repo: parsed.repo,
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

const handleFetchPageIssues = async (
  message: FetchPageIssuesMessage,
  sendResponse: (response: FetchPageIssuesResponse) => void,
) => {
  try {
    const octokit = await getOctokit();
    const { owner, repo } = await getRepoConfig();
    const { githubPat } = await chrome.storage.local.get('githubPat');

    let hostname = '';
    let pathname = '';
    try {
      const url = new URL(message.payload.pageUrl);
      hostname = url.hostname;
      pathname = url.pathname;
    } catch {
      sendResponse({ success: false, error: 'Invalid page URL' });
      return;
    }

    // Don't filter by label — labels may not exist in the repo and get silently dropped.
    // Instead, fetch recent issues and match by title prefix + body content.
    const { data: issues } = await octokit.issues.listForRepo({
      owner,
      repo,
      state: 'open',
      sort: 'created',
      direction: 'desc',
      per_page: 100,
    });

    const filtered = issues.filter(issue => {
      if (issue.pull_request) return false;
      if (!issue.title.startsWith('[Visual]')) return false;
      const body = issue.body ?? '';
      const storeMatch = body.match(/\*\*Store:\*\*\s*(\S+)/);
      const pageMatch = body.match(/\*\*Page:\*\*\s*(\S+)/);
      if (!storeMatch || !pageMatch) return false;
      return storeMatch[1] === hostname && pageMatch[1] === pathname;
    });

    // Parse issue metadata (raw URLs from body, not yet resolved)
    const matched: PageIssue[] = filtered.map(issue => {
      const body = issue.body ?? '';
      const descriptionMatch = body.match(/## Description\r?\n([\s\S]*?)(?:\r?\n##|\r?\n---|\s*$)/);
      const urlMatch = body.match(/!\[Screenshot]\(([^)]+)\)/);

      return {
        number: issue.number,
        title: issue.title,
        state: issue.state as 'open' | 'closed',
        html_url: issue.html_url,
        created_at: issue.created_at,
        author: issue.user?.login,
        author_avatar: issue.user?.avatar_url,
        description: descriptionMatch?.[1]?.trim(),
        screenshot_url: urlMatch?.[1],
        has_analysis: issue.labels?.some(
          (label: string | { name?: string }) => (typeof label === 'string' ? label : label?.name) === 'analyzed',
        ),
      };
    });

    // Merge any recently created issue that the API may not have indexed yet
    const cacheKey = `${hostname}:${pathname}`;
    const cached = recentIssuesCache.get(cacheKey);
    if (cached && !matched.some(i => i.number === cached.number)) {
      matched.unshift(cached);
    }

    // Resolve screenshot URLs to signed/fresh URLs that work cross-origin.
    // Release asset browser_download_url requires GitHub auth (works on github.com
    // but not in <img> tags on other domains). We follow the API redirect to get
    // a short-lived signed CDN URL instead.
    const hasReleaseAssets = matched.some(i => i.screenshot_url?.includes('/releases/download/'));
    const releaseAssetMap = new Map<string, string>();
    if (hasReleaseAssets) {
      try {
        const { data: releases } = await octokit.repos.listReleases({ owner, repo, per_page: 10 });
        const release = releases.find(r => r.tag_name === RELEASE_TAG);
        if (release) {
          for (const asset of release.assets) {
            releaseAssetMap.set(asset.name, asset.url);
          }
        }
      } catch {
        // API error
      }
    }

    await Promise.all(
      matched.map(async issue => {
        const url = issue.screenshot_url;
        if (!url) return;

        if (url.includes('/releases/download/')) {
          const filename = url.split('/').pop();
          const apiUrl = filename ? releaseAssetMap.get(filename) : undefined;
          if (apiUrl && githubPat && apiUrl.startsWith('https://api.github.com/')) {
            try {
              const controller = new AbortController();
              const res = await fetch(apiUrl, {
                headers: { Authorization: `Bearer ${githubPat}`, Accept: 'application/octet-stream' },
                signal: controller.signal,
              });
              // response.url is the final URL after redirect — a signed CDN URL
              if (res.url !== apiUrl) {
                issue.screenshot_url = res.url;
              }
              controller.abort();
            } catch {
              // Fetch failed or aborted
            }
          }
        } else if (url.includes('raw.githubusercontent.com') || url.includes('/raw/')) {
          // Legacy: repo-committed screenshot — need fresh download URL
          const pathMatch =
            url.match(/https:\/\/raw\.githubusercontent\.com\/[^/]+\/[^/]+\/[^/]+\/(.+)/) ??
            url.match(/https:\/\/github\.com\/[^/]+\/[^/]+\/raw\/[^/]+\/(.+)/);
          if (pathMatch) {
            try {
              const { data } = await octokit.repos.getContent({ owner, repo, path: pathMatch[1] });
              if (!Array.isArray(data) && data.download_url) {
                issue.screenshot_url = data.download_url;
              }
            } catch {
              // File may have been deleted
            }
          }
        }
      }),
    );

    sendResponse({ success: true, issues: matched });
  } catch (err) {
    sendResponse({ success: false, error: err instanceof Error ? err.message : 'Unknown error' });
  }
};

const handleShowIssuesPanel = async (message: ShowIssuesPanelMessage) => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      await chrome.tabs.sendMessage(tab.id, message);
    }
  } catch {
    // Content script may not be injected; silently ignore
  }
};
