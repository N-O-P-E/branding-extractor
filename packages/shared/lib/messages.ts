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
  };
}

export interface CreateIssueMessage {
  type: 'CREATE_ISSUE';
  payload: {
    description: string;
    screenshotDataUrl: string;
    annotatedScreenshotDataUrl: string;
    region: Region;
    pageUrl: string;
    viewportWidth: number;
    viewportHeight: number;
    template?: string;
    htmlSnippet?: string;
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
  | ShowIssuesPanelMessage;

export interface MessageResponse {
  success: boolean;
  error?: string;
  issueUrl?: string;
  issueNumber?: number;
}

export interface HtmlSnippetResponse {
  html?: string;
}
