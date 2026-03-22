import 'webextension-polyfill';
import { Octokit } from '@octokit/rest';
import type {
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

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);

chrome.runtime.onMessage.addListener(
  (message: ExtensionMessage, _sender, sendResponse: (response: MessageResponse | FetchPageIssuesResponse) => void) => {
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

const getOctokit = async (): Promise<Octokit> => {
  const { githubPat } = await chrome.storage.sync.get('githubPat');
  if (!githubPat) {
    throw new Error('GitHub token not configured. Go to extension options to set it up.');
  }
  return new Octokit({ auth: githubPat });
};

const getRepoConfig = async (): Promise<{ owner: string; repo: string }> => {
  const { selectedRepo } = await chrome.storage.sync.get('selectedRepo');
  if (!selectedRepo || !selectedRepo.includes('/')) {
    throw new Error('No repository selected. Go to extension options to configure.');
  }
  const [owner, repo] = selectedRepo.split('/');
  return { owner, repo };
};

// In-memory cache of recently created issues so they appear immediately
// in fetch results even before GitHub's API has indexed them.
const recentIssuesCache: Map<string, PageIssue> = new Map();

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
    body: 'Screenshots uploaded by Coworker by Studio N.O.P.E.. Do not delete this release.',
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
    } = message.payload;

    const releaseId = await getOrCreateScreenshotRelease(octokit, owner, repo);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `issue-${timestamp}.png`;

    const asset = await octokit.repos.uploadReleaseAsset({
      owner,
      repo,
      release_id: releaseId,
      name: filename,
      // @ts-expect-error — Octokit types expect string but ArrayBuffer works at runtime
      data: dataUrlToArrayBuffer(annotatedScreenshotDataUrl),
      headers: { 'content-type': 'image/png' },
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

    let body = `## Screenshot\n![Screenshot](${screenshotUrl})\n\n`;
    body += `## Description\n${description}\n\n`;
    body += `## Details\n`;
    body += `- **Page:** ${pagePath}\n`;
    body += `- **Store:** ${hostname}\n`;
    body += `- **Environment:** ${environment}\n`;
    if (template) body += `- **Template:** ${template}\n`;
    if (themeId) body += `- **Theme ID:** ${themeId}\n`;
    body += `- **Viewport:** ${viewportWidth} x ${viewportHeight}\n`;
    if (region) {
      body += `- **Region:** x:${Math.round(region.x)}, y:${Math.round(region.y)}, width:${Math.round(region.width)}, height:${Math.round(region.height)}\n`;
    }
    if (htmlSnippet) {
      body += `\n## HTML Snippet\n\`\`\`html\n${htmlSnippet}\n\`\`\`\n`;
    }
    body += `\n## Analysis\n`;
    body += `> Tag \`@claude\` in a comment to analyze this issue against the codebase.\n`;
    body += `\n---\n*Reported via Coworker by Studio N.O.P.E.*\n`;

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
    recentIssuesCache.set(cacheKey, {
      number: issue.data.number,
      title,
      state: 'open',
      html_url: issue.data.html_url,
      created_at: new Date().toISOString(),
      description: description.trim(),
      screenshot_url: screenshotUrl,
    });

    sendResponse({
      success: true,
      issueUrl: issue.data.html_url,
      issueNumber: issue.data.number,
    });
  } catch (err) {
    sendResponse({ success: false, error: err instanceof Error ? err.message : 'Unknown error' });
  }
};

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

const handleFetchPageIssues = async (
  message: FetchPageIssuesMessage,
  sendResponse: (response: FetchPageIssuesResponse) => void,
) => {
  try {
    const octokit = await getOctokit();
    const { owner, repo } = await getRepoConfig();
    const { githubPat } = await chrome.storage.sync.get('githubPat');

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
      state: 'all',
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
          if (apiUrl && githubPat) {
            try {
              const controller = new AbortController();
              const res = await fetch(apiUrl, {
                headers: { Authorization: `token ${githubPat}`, Accept: 'application/octet-stream' },
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
