/**
 * Extension message types.
 *
 * Only the types actively used by the content script are kept here.
 * Phase 3 (branding extraction) will extend this file with design-system
 * extraction messages.
 */

export interface GetHtmlSnippetMessage {
  type: 'GET_HTML_SNIPPET';
  payload: {
    x: number;
    y: number;
  };
}

export interface HtmlSnippetResponse {
  html?: string;
}

export type ExtensionMessage = GetHtmlSnippetMessage;
