/**
 * Extension message types.
 *
 * Only the types actively used by the content script are kept here.
 */

import type { ExtractionResult } from '@extension/extractor';

export interface ExtractStylesMessage {
  type: 'EXTRACT_STYLES';
}

export interface ExtractStylesResponse {
  result: ExtractionResult;
}

export type ExtensionMessage = ExtractStylesMessage;
