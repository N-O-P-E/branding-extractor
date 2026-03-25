export interface Region {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ShopifyContext {
  storeName: string;
  storeHandle: string;
  themeName?: string;
  themeId?: string;
  template?: string;
  environment: 'editor' | 'preview' | 'live' | 'local';
  buildVersion?: string;
  locale?: string;
  editorUrl?: string;
}

export interface BrowserMetadata {
  browser: { name: string; version: string; engine: string };
  os: { name: string; version: string; platform: string };
  device: {
    type: 'desktop' | 'tablet' | 'mobile';
    screenWidth: number;
    screenHeight: number;
    pixelRatio: number;
    colorScheme: 'dark' | 'light' | 'no-preference';
  };
  page: { title: string; language: string; zoomLevel: number };
  network: { online: boolean; connectionType?: string };
  consoleErrors: Array<{ level: 'error' | 'warn'; message: string; timestamp: number }>;
  userAgent: string;
  shopify?: ShopifyContext;
}

export interface StartReportMessage {
  type: 'START_REPORT';
}

export interface OverlayTheme {
  accent: string;
  accentLight: string;
  surface: string;
  textPrimary: string;
  textSecondary: string;
  border: string;
}

export interface ShowScreenshotMessage {
  type: 'SHOW_SCREENSHOT';
  payload: {
    screenshotDataUrl: string;
    tool: 'select' | 'pencil' | 'inspect';
    theme?: OverlayTheme;
  };
}

export interface ActivateToolMessage {
  type: 'ACTIVATE_TOOL';
  payload: { tool: 'select' | 'pencil' | 'inspect' };
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
    browserMetadata?: BrowserMetadata;
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

export interface FetchBranchesMessage {
  type: 'FETCH_BRANCHES';
  payload: { repo: string };
}

export interface FetchBranchesResponse {
  success: boolean;
  branches?: Array<{ name: string; default: boolean }>;
  error?: string;
}

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
    branch?: string;
    browserMetadata?: BrowserMetadata;
    autoFix?: boolean;
    videoUrl?: string;
    videoDurationMs?: number;
  };
}

export interface GetHtmlSnippetMessage {
  type: 'GET_HTML_SNIPPET';
  payload: {
    x: number;
    y: number;
  };
}

export interface PageIssue {
  number: number;
  title: string;
  state: 'open' | 'closed';
  html_url: string;
  created_at: string;
  author?: string;
  author_avatar?: string;
  description?: string;
  screenshot_url?: string;
  has_analysis?: boolean;
}

export interface FetchPageIssuesMessage {
  type: 'FETCH_PAGE_ISSUES';
  payload: { pageUrl: string };
}

export interface FetchPageIssuesResponse {
  success: boolean;
  issues?: PageIssue[];
  error?: string;
}

export interface ShowIssuesPanelMessage {
  type: 'SHOW_ISSUES_PANEL';
  payload: { issues: PageIssue[] };
}

export interface ToolSwitchedMessage {
  type: 'TOOL_SWITCHED';
  payload: { tool: 'select' | 'pencil' | 'inspect' };
}

export interface RequestCaptureMessage {
  type: 'REQUEST_CAPTURE';
}

export interface FetchReposMessage {
  type: 'FETCH_REPOS';
}

export interface FetchReposResponse {
  success: boolean;
  repos?: Array<{ full_name: string; description: string | null }>;
  error?: string;
}

export interface ValidateTokenMessage {
  type: 'VALIDATE_TOKEN';
  payload: { token: string };
}

export interface ValidateTokenResponse {
  success: boolean;
  login?: string;
  error?: string;
}

export interface RemoveTokenMessage {
  type: 'REMOVE_TOKEN';
}

export interface CheckTokenStatusMessage {
  type: 'CHECK_TOKEN_STATUS';
}

export interface CheckTokenStatusResponse {
  connected: boolean;
  login?: string;
}

// Auto-fix with Claude
export interface AutoFixSettings {
  enabled: boolean;
  anthropicApiKey?: string;
  systemPrompt?: string;
  model?: string;
  autoFixByDefault?: boolean;
}

export interface SaveAutoFixSettingsMessage {
  type: 'SAVE_AUTO_FIX_SETTINGS';
  payload: AutoFixSettings;
}

export interface GetAutoFixSettingsMessage {
  type: 'GET_AUTO_FIX_SETTINGS';
}

export interface GetAutoFixSettingsResponse {
  success: boolean;
  settings?: AutoFixSettings;
}

export interface EnsureAutoFixWorkflowMessage {
  type: 'ENSURE_AUTO_FIX_WORKFLOW';
  payload: { repo: string };
}

export interface EnsureAutoFixWorkflowResponse {
  success: boolean;
  created?: boolean;
  error?: string;
}

// Screen recording
export interface StartRecordingMessage {
  type: 'START_RECORDING';
}

export interface StopRecordingMessage {
  type: 'STOP_RECORDING';
}

export interface RecordingCompleteMessage {
  type: 'RECORDING_COMPLETE';
  payload: {
    mimeType: string;
    durationMs: number;
    pageUrl: string;
    videoUrl?: string;
  };
}

export interface RecordingStatusMessage {
  type: 'RECORDING_STATUS';
  payload: {
    status: 'started' | 'stopped' | 'error';
    error?: string;
  };
}

export interface OffscreenReadyMessage {
  type: 'OFFSCREEN_READY';
}

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
  | FetchAssigneesMessage
  | FetchReposMessage
  | RequestCaptureMessage
  | ValidateTokenMessage
  | RemoveTokenMessage
  | CheckTokenStatusMessage
  | SaveAutoFixSettingsMessage
  | GetAutoFixSettingsMessage
  | EnsureAutoFixWorkflowMessage
  | StartRecordingMessage
  | StopRecordingMessage
  | RecordingCompleteMessage
  | RecordingStatusMessage
  | OffscreenReadyMessage;

export interface MessageResponse {
  success: boolean;
  error?: string;
  issueUrl?: string;
  issueNumber?: number;
}

export interface HtmlSnippetResponse {
  html?: string;
}
