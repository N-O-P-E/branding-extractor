/**
 * Extension message types.
 *
 * Only the types actively used by the content script are kept here.
 */

import type { ExtractionResult, TokenOverride } from '@extension/extractor';

export interface ExtractStylesMessage {
  type: 'EXTRACT_STYLES';
}

export interface ExtractStylesResponse {
  result: ExtractionResult;
}

export interface ApplyOverrideMessage {
  type: 'APPLY_OVERRIDE';
  payload: TokenOverride;
}

export interface RemoveOverrideMessage {
  type: 'REMOVE_OVERRIDE';
  payload: { tokenId: string };
}

export interface ClearOverridesMessage {
  type: 'CLEAR_ALL_OVERRIDES';
}

export interface SetOverridesEnabledMessage {
  type: 'SET_OVERRIDES_ENABLED';
  payload: { enabled: boolean };
}

export interface GetOverrideStateMessage {
  type: 'GET_OVERRIDE_STATE';
}

export interface GetOverrideStateResponse {
  overrides: TokenOverride[];
  enabled: boolean;
}

export interface ActivateInspectorMessage {
  type: 'ACTIVATE_INSPECTOR';
}

export interface DeactivateInspectorMessage {
  type: 'DEACTIVATE_INSPECTOR';
}

export interface CaptureScreenshotMessage {
  type: 'CAPTURE_SCREENSHOT';
  payload: { mode: 'before' | 'after' | 'current' };
}

export interface CaptureScreenshotResponse {
  dataUrl: string;
}

export type ExtensionMessage =
  | ExtractStylesMessage
  | ApplyOverrideMessage
  | RemoveOverrideMessage
  | ClearOverridesMessage
  | SetOverridesEnabledMessage
  | GetOverrideStateMessage
  | ActivateInspectorMessage
  | DeactivateInspectorMessage
  | CaptureScreenshotMessage;
