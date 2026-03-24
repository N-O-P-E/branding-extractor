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

export interface ShowScreenshotMessage {
  type: 'SHOW_SCREENSHOT';
  payload: {
    screenshotDataUrl: string;
    tool: 'select' | 'pencil' | 'inspect';
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
    browserMetadata?: BrowserMetadata;
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
  | CheckTokenStatusMessage;

export interface MessageResponse {
  success: boolean;
  error?: string;
  issueUrl?: string;
  issueNumber?: number;
}

export interface HtmlSnippetResponse {
  html?: string;
}
