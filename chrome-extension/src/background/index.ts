import 'webextension-polyfill';
import { Octokit } from '@octokit/rest';
import type {
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

// Rule IDs for declarativeNetRequest session rules (used in handleUploadVideoAttachment and onSuspend cleanup)
const POLICY_RULE_ID = 9990;
const CONFIRM_RULE_ID = 9991;

/** Fetch with AbortController timeout. Throws 'Request timed out' on timeout. */
const fetchWithTimeout = (url: string, options: RequestInit = {}, timeoutMs: number): Promise<Response> => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(id));
};

const API_TIMEOUT = 30_000;
const UPLOAD_TIMEOUT = 300_000;
const TOKEN_TIMEOUT = 15_000;

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

/** Validates that a string matches the `owner/repo` format */
const REPO_NAME_REGEX = /^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/;

const parseRepoName = (repo: string): { owner: string; repo: string } | null => {
  if (!REPO_NAME_REGEX.test(repo)) return null;
  const [owner, name] = repo.split('/');
  return { owner, repo: name };
};

/** Overlay theme definitions for content-UI (keyed by theme ID) */
const OVERLAY_THEMES: Record<
  string,
  { accent: string; accentLight: string; surface: string; textPrimary: string; textSecondary: string; border: string }
> = {
  'ask-phill': {
    accent: '#D8CCB5',
    accentLight: 'rgba(216,204,181,0.2)',
    surface: '#1C1C1C',
    textPrimary: '#FAF8F7',
    textSecondary: 'rgba(250,248,247,0.5)',
    border: 'rgba(255,255,255,0.1)',
  },
  strix: {
    accent: '#FFDB32',
    accentLight: 'rgba(255,219,50,0.15)',
    surface: '#222222',
    textPrimary: '#FFFFFF',
    textSecondary: 'rgba(255,255,255,0.55)',
    border: 'rgba(255,255,255,0.1)',
  },
};

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);

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
    if (message.type === 'FETCH_BRANCHES') {
      handleFetchBranches(message, sendResponse);
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
    if (message.type === 'CHECK_REPO_WORKFLOW') {
      handleCheckRepoWorkflow(message as { type: string; payload: { repo: string } }, sendResponse);
      return true;
    }
    if (message.type === 'CHECK_REPO_SECRET') {
      handleCheckRepoSecret(message as { type: string; payload: { repo: string; secretName: string } }, sendResponse);
      return true;
    }
    if (message.type === 'SHOW_ISSUES_PANEL') {
      handleShowIssuesPanel(message);
      return true;
    }
    if (message.type === 'UPDATE_ICON_THEME') {
      const themeId = message.payload?.theme as string;
      updateIconForTheme(themeId);
      // Forward overlay theme to active tab's content-UI
      const overlayTheme = themeId && themeId !== 'default' ? OVERLAY_THEMES[themeId] : undefined;
      chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
        if (tab?.id) {
          chrome.tabs.sendMessage(tab.id, { type: 'UPDATE_OVERLAY_THEME', payload: overlayTheme }).catch(() => {});
        }
      });
      return false;
    }
    if (message.type === 'UPLOAD_VIDEO_ATTACHMENT') {
      handleUploadVideoAttachment(message as unknown as UploadVideoAttachmentMessage, sendResponse);
      return true;
    }
    return false;
  },
);

// --- Video attachment upload via GitHub user-content (renders inline in issues) ---

interface UploadVideoAttachmentMessage {
  type: 'UPLOAD_VIDEO_ATTACHMENT';
  payload: {
    repositoryId: number;
    fileName: string;
    contentType: string;
    videoArrayBuffer: ArrayBuffer;
    cookieStr: string;
  };
}

/** Inject forbidden headers via declarativeNetRequest session rules (fetch silently strips Cookie, Origin, Referer) */
const injectGitHubHeaders = async (ruleId: number, urlFilter: string, cookieStr: string) => {
  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: [ruleId],
    addRules: [
      {
        id: ruleId,
        priority: 1,
        action: {
          type: chrome.declarativeNetRequest.RuleActionType.MODIFY_HEADERS,
          requestHeaders: [
            { header: 'Cookie', operation: chrome.declarativeNetRequest.HeaderOperation.SET, value: cookieStr },
            {
              header: 'Origin',
              operation: chrome.declarativeNetRequest.HeaderOperation.SET,
              value: 'https://github.com',
            },
            {
              header: 'Referer',
              operation: chrome.declarativeNetRequest.HeaderOperation.SET,
              value: 'https://github.com/',
            },
            {
              header: 'GitHub-Verified-Fetch',
              operation: chrome.declarativeNetRequest.HeaderOperation.SET,
              value: 'true',
            },
            {
              header: 'X-Requested-With',
              operation: chrome.declarativeNetRequest.HeaderOperation.SET,
              value: 'XMLHttpRequest',
            },
          ],
        },
        condition: {
          urlFilter,
          resourceTypes: [chrome.declarativeNetRequest.ResourceType.XMLHTTPREQUEST],
        },
      },
    ],
  });
};

const removeHeaderRule = async (ruleId: number) => {
  await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [ruleId] });
};

const handleUploadVideoAttachment = async (
  message: UploadVideoAttachmentMessage,
  sendResponse: (response: { success: boolean; videoUrl?: string; error?: string }) => void,
) => {
  try {
    const { repositoryId, fileName, contentType, videoArrayBuffer, cookieStr } = message.payload;

    // Verify optional permissions are granted before using declarativeNetRequest
    const hasPerms = await chrome.permissions.contains({
      permissions: ['cookies'],
    });
    if (!hasPerms) {
      sendResponse({ success: false, error: 'Video upload permissions not granted' });
      return;
    }

    // Step 1: Request upload policy — inject Cookie via declarativeNetRequest
    await injectGitHubHeaders(POLICY_RULE_ID, '*://github.com/upload/policies/assets*', cookieStr);

    const formData = new FormData();
    formData.append('repository_id', String(repositoryId));
    formData.append('name', fileName);
    formData.append('size', String(videoArrayBuffer.byteLength));
    formData.append('content_type', contentType);

    const policyRes = await fetchWithTimeout(
      'https://github.com/upload/policies/assets',
      {
        method: 'POST',
        headers: { Accept: 'application/json' },
        body: formData,
      },
      UPLOAD_TIMEOUT,
    );

    await removeHeaderRule(POLICY_RULE_ID);

    if (!policyRes.ok) {
      const text = await policyRes.text();
      throw new Error(`Policy request failed: ${policyRes.status} ${text}`);
    }
    const policy = await policyRes.json();

    // Step 2: Upload file to S3 (no cookies needed — uses S3 pre-signed policy)
    const blob = new Blob([videoArrayBuffer], { type: contentType });
    const s3Form = new FormData();
    for (const [key, value] of Object.entries(policy.form as Record<string, string>)) {
      s3Form.append(key, value);
    }
    s3Form.append('file', blob, fileName);

    const s3Res = await fetchWithTimeout(policy.upload_url, { method: 'POST', body: s3Form }, UPLOAD_TIMEOUT);
    if (!s3Res.ok && s3Res.status !== 204 && s3Res.status !== 201) {
      throw new Error(`S3 upload failed: ${s3Res.status}`);
    }

    // Step 3: Confirm upload — inject Cookie again for github.com
    await injectGitHubHeaders(CONFIRM_RULE_ID, '*://github.com/upload/assets*', cookieStr);

    const confirmForm = new FormData();
    confirmForm.append('authenticity_token', policy.asset_upload_authenticity_token);

    await fetchWithTimeout(
      `https://github.com${policy.asset_upload_url}`,
      {
        method: 'PUT',
        headers: { Accept: 'application/json' },
        body: confirmForm,
      },
      UPLOAD_TIMEOUT,
    );

    await removeHeaderRule(CONFIRM_RULE_ID);

    sendResponse({ success: true, videoUrl: policy.asset.href });
  } catch (err) {
    // Clean up rules on error
    await removeHeaderRule(POLICY_RULE_ID).catch(() => {});
    await removeHeaderRule(CONFIRM_RULE_ID).catch(() => {});
    const classified = classifyError(err);
    sendResponse({ success: false, error: classified.message });
  }
};

/** Use raw fetch for existence checks to avoid Octokit throwing on 404 (which pollutes the service worker error log) */
const githubFetchStatus = async (path: string): Promise<number> => {
  const { githubPat } = await chrome.storage.local.get('githubPat');
  if (!githubPat) throw new Error('GitHub token not configured.');
  const res = await fetchWithTimeout(
    `https://api.github.com${path}`,
    {
      headers: { Authorization: `Bearer ${githubPat}`, Accept: 'application/vnd.github+json' },
    },
    API_TIMEOUT,
  );
  if (res.status === 401) {
    await chrome.storage.local.remove(['githubPat', 'githubPatUser']);
    chrome.runtime.sendMessage({ type: 'TOKEN_REVOKED' }).catch(() => {});
  }
  return res.status;
};

const WORKFLOW_VERSION_MARKER = '# visual-issue-reporter: v4';

const handleCheckRepoWorkflow = async (
  message: { type: string; payload: { repo: string } },
  sendResponse: (response: MessageResponse & { exists?: boolean; current?: boolean }) => void,
) => {
  try {
    const parsed = parseRepoName(message.payload.repo);
    if (!parsed) {
      sendResponse({ success: false, error: 'Invalid repo' });
      return;
    }
    const { githubPat } = await chrome.storage.local.get('githubPat');
    if (!githubPat) throw new Error('GitHub token not configured.');
    const res = await fetchWithTimeout(
      `https://api.github.com/repos/${parsed.owner}/${parsed.repo}/contents/.github/workflows/visual-issue-claude-fix.yml`,
      { headers: { Authorization: `Bearer ${githubPat}`, Accept: 'application/vnd.github+json' } },
      API_TIMEOUT,
    );
    if (res.status === 401) {
      await chrome.storage.local.remove(['githubPat', 'githubPatUser']);
      chrome.runtime.sendMessage({ type: 'TOKEN_REVOKED' }).catch(() => {});
    }
    if (res.status === 404) {
      sendResponse({ success: true, exists: false });
      return;
    }
    if (res.status !== 200) {
      sendResponse({ success: true, exists: false });
      return;
    }
    const data = (await res.json()) as { content?: string };
    const content = data.content ? atob(data.content.replace(/\n/g, '')) : '';
    sendResponse({ success: true, exists: true, current: content.includes(WORKFLOW_VERSION_MARKER) });
  } catch (err) {
    const classified = classifyError(err);
    sendResponse({ success: false, error: classified.message });
  }
};

const handleCheckRepoSecret = async (
  message: { type: string; payload: { repo: string; secretName: string } },
  sendResponse: (response: MessageResponse & { exists?: boolean }) => void,
) => {
  try {
    const parsed = parseRepoName(message.payload.repo);
    if (!parsed) {
      sendResponse({ success: false, error: 'Invalid repo' });
      return;
    }
    const status = await githubFetchStatus(
      `/repos/${parsed.owner}/${parsed.repo}/actions/secrets/${message.payload.secretName}`,
    );
    sendResponse({ success: true, exists: status === 200 });
  } catch (err) {
    const classified = classifyError(err);
    sendResponse({ success: false, error: classified.message });
  }
};

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

    // Read theme for overlay
    const { extensionTheme, unlockedThemes } = await chrome.storage.local.get(['extensionTheme', 'unlockedThemes']);
    const themeId = extensionTheme as string | undefined;
    const isThemed =
      themeId &&
      themeId !== 'default' &&
      (unlockedThemes as Array<{ id: string }> | undefined)?.some(t => t.id === themeId);

    const overlayTheme = isThemed && themeId ? OVERLAY_THEMES[themeId] : undefined;

    const payload: ShowScreenshotMessage = {
      type: 'SHOW_SCREENSHOT',
      payload: { screenshotDataUrl, tool, theme: overlayTheme },
    };

    await chrome.tabs.sendMessage(tab.id, payload);
    // Also notify side panel that overlay is opening
    chrome.runtime.sendMessage({ type: 'OVERLAY_OPENED' }).catch(() => {});
    sendResponse({ success: true });
  } catch (err) {
    await check401(err);
    const classified = classifyError(err);
    sendResponse({ success: false, error: classified.message });
  }
};

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

/** Check if an API error is a 401 and auto-disconnect the token */
const check401 = async (err: unknown): Promise<void> => {
  const status = (err as { status?: number })?.status;
  if (status === 401) {
    await chrome.storage.local.remove(['githubPat', 'githubPatUser']);
    chrome.runtime.sendMessage({ type: 'TOKEN_REVOKED' }).catch(() => {});
  }
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
    const response = await fetchWithTimeout(
      'https://api.github.com/user',
      {
        headers: { Authorization: `Bearer ${token}` },
      },
      TOKEN_TIMEOUT,
    );
    if (!response.ok) {
      sendResponse({ success: false, error: 'Invalid token — could not authenticate.' });
      return;
    }
    // Check scopes — classic tokens expose them via x-oauth-scopes header
    const scopes = response.headers.get('x-oauth-scopes') ?? '';
    const hasRepoScope = scopes.split(',').some(s => s.trim() === 'repo');
    // Fine-grained tokens don't return x-oauth-scopes, so we allow those through
    // (they'll fail at the API call level if permissions are missing)
    const isFineGrained = !scopes && token.startsWith('github_pat_');
    if (!hasRepoScope && !isFineGrained) {
      sendResponse({
        success: false,
        error: 'Token is missing the "repo" scope. Create a classic token with the repo scope.',
      });
      return;
    }
    const user = (await response.json()) as { login: string };
    await chrome.storage.local.set({ githubPat: token, githubPatUser: user.login });
    sendResponse({ success: true, login: user.login });
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
  if (!githubPat) {
    sendResponse({ connected: false });
    return;
  }
  // Verify the token still works and has the right scope
  try {
    const response = await fetchWithTimeout(
      'https://api.github.com/user',
      {
        headers: { Authorization: `Bearer ${githubPat}` },
      },
      TOKEN_TIMEOUT,
    );
    if (!response.ok) {
      // Token revoked or expired — clean up
      await chrome.storage.local.remove(['githubPat', 'githubPatUser']);
      sendResponse({ connected: false });
      return;
    }
    const scopes = response.headers.get('x-oauth-scopes') ?? '';
    const hasRepoScope = scopes.split(',').some(s => s.trim() === 'repo');
    const isFineGrained = !scopes && String(githubPat).startsWith('github_pat_');
    if (!hasRepoScope && !isFineGrained) {
      // Token is valid but missing required scope — clean up
      await chrome.storage.local.remove(['githubPat', 'githubPatUser']);
      sendResponse({ connected: false });
      return;
    }
    sendResponse({ connected: true, login: (githubPatUser as string) || undefined });
  } catch {
    // Network error — assume still valid to avoid disconnecting on transient failures
    sendResponse({ connected: !!githubPat, login: (githubPatUser as string) || undefined });
  }
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
  const marker = ';base64,';
  const idx = dataUrl.indexOf(marker);
  const base64 = idx !== -1 ? dataUrl.substring(idx + marker.length) : dataUrl;
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
      branch,
      browserMetadata,
      autoFix,
      videoUrl,
      videoDurationMs,
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

    if (videoUrl) {
      const durationSec = videoDurationMs ? Math.round(videoDurationMs / 1000) : 0;
      body += `## Recording${durationSec ? ` (${durationSec}s)` : ''}\n`;
      if (videoUrl.includes('user-attachments/assets')) {
        // GitHub auto-embeds user-attachment URLs as inline video players
        body += `\n${videoUrl}\n\n`;
      } else {
        // Release asset URL — provide download link
        body += `[▶ Watch recording${durationSec ? ` (${durationSec}s)` : ''}](${videoUrl})\n\n`;
      }
    }
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
      if (branch) body += `- **Target Branch:** ${branch}\n`;
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
    body += `> Tag \`@\u200Bclaude\` in a comment to analyze this issue against the codebase.\n`;
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
    let autoFixResult: AutoFixResult | undefined;
    let autoFixError: string | undefined;
    if (autoFix) {
      try {
        autoFixResult = await setupAutoFix(octokit, owner, repo, issue.data.number);
      } catch (autoFixErr) {
        console.error('Auto-fix setup failed:', autoFixErr);
        autoFixResult = 'failed';
        autoFixError = autoFixErr instanceof Error ? autoFixErr.message : String(autoFixErr);
      }
    }

    sendResponse({
      success: true,
      issueUrl: issue.data.html_url,
      issueNumber: issue.data.number,
      autoFixResult,
      autoFixError,
    });
  } catch (err) {
    await check401(err);
    const classified = classifyError(err);
    sendResponse({ success: false, error: classified.message });
  }
};

type AutoFixResult = 'triggered' | 'no-workflow' | 'failed';

const setupAutoFix = async (
  octokit: Octokit,
  owner: string,
  repo: string,
  issueNumber: number,
): Promise<AutoFixResult> => {
  // 1. Ensure the auto-fix label exists
  try {
    await octokit.issues.getLabel({ owner, repo, name: 'auto-fix' });
  } catch {
    await octokit.issues.createLabel({
      owner,
      repo,
      name: 'auto-fix',
      color: 'a78bfa',
      description: 'Auto-fix with Claude Code',
    });
  }

  // 2. Check if the workflow file exists
  let workflowExists = false;
  try {
    await octokit.repos.getContent({ owner, repo, path: '.github/workflows/visual-issue-claude-fix.yml' });
    workflowExists = true;
  } catch {
    // Not found
  }

  // 3. Add the auto-fix label to the issue
  await octokit.issues.addLabels({
    owner,
    repo,
    issue_number: issueNumber,
    labels: ['auto-fix'],
  });

  return workflowExists ? 'triggered' : 'no-workflow';
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
    const hiddenLabels = ['visual-issue', 'auto-fix', 'from-extension'];
    sendResponse({
      success: true,
      labels: data.filter(l => !hiddenLabels.includes(l.name)).map(l => ({ name: l.name, color: l.color })),
    });
  } catch (err) {
    await check401(err);
    const classified = classifyError(err);
    sendResponse({ success: false, error: classified.message });
  }
};

const handleFetchBranches = async (
  message: { payload: { repo: string } },
  sendResponse: (response: {
    success: boolean;
    branches?: Array<{ name: string; default: boolean }>;
    error?: string;
  }) => void,
) => {
  try {
    const parsed = parseRepoName(message.payload.repo);
    if (!parsed) {
      sendResponse({ success: false, error: 'Invalid repository name format.' });
      return;
    }
    const octokit = await getOctokit();
    // Get default branch
    const { data: repoData } = await octokit.repos.get({ owner: parsed.owner, repo: parsed.repo });
    const defaultBranch = repoData.default_branch;
    // Fetch branches
    const { data } = await octokit.repos.listBranches({
      owner: parsed.owner,
      repo: parsed.repo,
      per_page: 100,
    });
    sendResponse({
      success: true,
      branches: data.map(b => ({ name: b.name, default: b.name === defaultBranch })),
    });
  } catch (err) {
    await check401(err);
    const classified = classifyError(err);
    sendResponse({ success: false, error: classified.message });
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
    await check401(err);
    const classified = classifyError(err);
    sendResponse({ success: false, error: classified.message });
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
    await check401(err);
    const classified = classifyError(err);
    sendResponse({ success: false, error: classified.message });
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
      // **Page:** is written as a markdown link: [url](url)
      // Extract the URL from the markdown link brackets
      const pageMatch = body.match(/\*\*Page:\*\*\s*\[([^\]]+)\]/);
      if (!pageMatch) return false;
      try {
        const issueUrl = new URL(pageMatch[1]);
        return issueUrl.hostname === hostname && issueUrl.pathname === pathname;
      } catch {
        return false;
      }
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
    await check401(err);
    const classified = classifyError(err);
    sendResponse({ success: false, error: classified.message });
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

/** Theme icon colors — maps theme ID to the target tint color [r,g,b] */
const THEME_ICON_COLORS: Record<string, [number, number, number]> = {
  default: [139, 92, 246], // purple #8B5CF6
  'ask-phill': [222, 0, 21], // red #DE0015
  strix: [255, 219, 50], // yellow #FFDB32
};

const updateIconForTheme = async (themeId: string) => {
  const targetColor = THEME_ICON_COLORS[themeId] ?? THEME_ICON_COLORS.default;

  try {
    const response = await fetch(chrome.runtime.getURL('icon-34.png'));
    const blob = await response.blob();
    const bitmap = await createImageBitmap(blob);

    const canvas = new OffscreenCanvas(34, 34);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(bitmap, 0, 0, 34, 34);
    const imageData = ctx.getImageData(0, 0, 34, 34);
    const data = imageData.data;

    // Tint: replace non-transparent pixels with the target color, keeping alpha
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] > 0) {
        data[i] = targetColor[0];
        data[i + 1] = targetColor[1];
        data[i + 2] = targetColor[2];
        // Keep original alpha
      }
    }

    ctx.putImageData(imageData, 0, 0);
    await chrome.action.setIcon({ imageData: imageData as unknown as ImageData });
  } catch {
    // Fallback to default icon
    await chrome.action.setIcon({ path: 'icon-34.png' });
  }
};

// Apply saved theme icon on startup
chrome.storage.local.get('extensionTheme', result => {
  const theme = (result.extensionTheme as string) ?? 'default';
  updateIconForTheme(theme);
});

// Recording is now handled directly in the side panel via getDisplayMedia — no offscreen document needed.
