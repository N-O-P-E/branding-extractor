export interface Region {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface StartReportMessage {
  type: 'START_REPORT';
}

export interface ShowScreenshotMessage {
  type: 'SHOW_SCREENSHOT';
  payload: {
    screenshotDataUrl: string;
    tool: 'select' | 'pencil';
  };
}

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

export interface MessageResponse {
  success: boolean;
  error?: string;
  issueUrl?: string;
  issueNumber?: number;
}

export interface HtmlSnippetResponse {
  html?: string;
}
