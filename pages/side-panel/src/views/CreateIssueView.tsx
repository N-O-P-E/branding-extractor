import AssigneeSelect from '../components/AssigneeSelect';
import LabelSelect from '../components/LabelSelect';
import { useState, useEffect, useCallback, useRef } from 'react';
import type { BrowserMetadata, AutoFixSettings } from '@extension/shared';

interface CaptureData {
  screenshotDataUrl: string;
  annotatedScreenshotDataUrl: string;
  region?: { x: number; y: number; width: number; height: number };
  pageUrl: string;
  viewportWidth: number;
  viewportHeight: number;
  htmlSnippet?: string;
  browserMetadata?: BrowserMetadata;
}

interface CreateIssueViewProps {
  captureData: CaptureData | null;
  browserMetadata: BrowserMetadata | null;
  onBack: () => void;
  onSuccess: () => void;
}

const colors = {
  bgPrimary: '#0f172a',
  inputBg: 'rgba(148,163,184,0.08)',
  border: 'rgba(148,163,184,0.15)',
  textPrimary: '#f1f5f9',
  textSecondary: 'rgba(241,245,249,0.45)',
  textMuted: 'rgba(241,245,249,0.3)',
  success: '#4ade80',
  error: '#f87171',
} as const;

export default function CreateIssueView({ captureData, browserMetadata, onBack, onSuccess }: CreateIssueViewProps) {
  const [description, setDescription] = useState('');
  const [selectedLabels, setSelectedLabels] = useState<string[]>([]);
  const [selectedAssignee, setSelectedAssignee] = useState('');
  const [selectedRepo, setSelectedRepo] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [successUrl, setSuccessUrl] = useState('');

  // Auto-fix state
  const [autoFixAvailable, setAutoFixAvailable] = useState(false);
  const [autoFixChecked, setAutoFixChecked] = useState(false);

  const [liveBrowserMetadata, setLiveBrowserMetadata] = useState<BrowserMetadata | null>(browserMetadata);

  useEffect(() => {
    chrome.storage.local.get('selectedRepo').then(result => {
      if (result.selectedRepo) setSelectedRepo(result.selectedRepo as string);
    });
    // Check if auto-fix is available
    chrome.storage.local.get('autoFixSettings').then(result => {
      if (result.autoFixSettings) {
        const settings = result.autoFixSettings as AutoFixSettings;
        setAutoFixAvailable(settings.enabled && !!settings.anthropicApiKey);
      }
    });
  }, []);

  // Listen for BROWSER_METADATA directly in this component
  useEffect(() => {
    const listener = (message: { type: string; payload?: BrowserMetadata }) => {
      if (message.type === 'BROWSER_METADATA' && message.payload) {
        setLiveBrowserMetadata(message.payload);
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  // Update when prop changes
  useEffect(() => {
    if (browserMetadata) setLiveBrowserMetadata(browserMetadata);
  }, [browserMetadata]);

  // Keep a ref to the latest captureData for the async submit flow
  const captureDataRef = useRef(captureData);
  captureDataRef.current = captureData;

  const handleSubmit = useCallback(async () => {
    if (submitting || !selectedRepo) return;
    setSubmitting(true);
    setError('');

    try {
      // If no capture data yet, request it from the content-UI overlay
      let data = captureDataRef.current;
      if (!data) {
        // Request capture — background forwards to content-UI, which sends CAPTURE_COMPLETE
        try {
          await chrome.runtime.sendMessage({ type: 'REQUEST_CAPTURE' });
        } catch (sendErr) {
          throw new Error(
            `Could not reach the page overlay. Make sure the overlay is open and the page is not a chrome:// page. (${sendErr instanceof Error ? sendErr.message : 'Unknown'})`,
          );
        }
        // Wait for CAPTURE_COMPLETE
        data = await new Promise<CaptureData>((resolve, reject) => {
          const timeout = setTimeout(
            () =>
              reject(
                new Error(
                  'Capture timed out after 10s. The overlay may have been closed or the page may have navigated. Try opening a tool (Select/Canvas) first, then submit.',
                ),
              ),
            10000,
          );
          const listener = (msg: { type: string; payload?: CaptureData }) => {
            if (msg.type === 'CAPTURE_COMPLETE' && msg.payload) {
              clearTimeout(timeout);
              chrome.runtime.onMessage.removeListener(listener);
              resolve(msg.payload);
            }
          };
          chrome.runtime.onMessage.addListener(listener);
        });
      }

      const response = (await chrome.runtime.sendMessage({
        type: 'CREATE_ISSUE',
        payload: {
          description,
          screenshotDataUrl: data.screenshotDataUrl,
          annotatedScreenshotDataUrl: data.annotatedScreenshotDataUrl,
          region: data.region,
          pageUrl: data.pageUrl,
          viewportWidth: data.viewportWidth,
          viewportHeight: data.viewportHeight,
          htmlSnippet: data.htmlSnippet,
          browserMetadata: data.browserMetadata,
          labels: selectedLabels,
          assignee: selectedAssignee || undefined,
          autoFix: autoFixChecked && autoFixAvailable,
        },
      })) as { success: boolean; issueUrl?: string; error?: string };

      if (response?.success) {
        setSuccessUrl(response.issueUrl ?? '');
      } else {
        setError(response?.error ?? 'Failed to create issue');
        setSubmitting(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create issue');
      setSubmitting(false);
    }
  }, [submitting, selectedRepo, description, selectedLabels, selectedAssignee, autoFixChecked, autoFixAvailable]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        void handleSubmit();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleSubmit]);

  if (successUrl !== undefined && successUrl !== '') {
    return (
      <div
        style={{
          flex: 1,
          minHeight: 'calc(100vh - 60px)',
          background: colors.bgPrimary,
          color: colors.textPrimary,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '40px 32px',
          textAlign: 'center',
        }}>
        {/* Icon */}
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: 16,
            background: 'rgba(139,92,246,0.12)',
            border: '1px solid rgba(139,92,246,0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 20,
          }}>
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            style={{ color: '#a78bfa' }}>
            <path
              d="M10.7998 14.0147L8.78539 13.4853L8.28179 11.8971L6.77099 11.3676L6.53209 10.3631C6.37692 9.71056 5.79399 9.25 5.12329 9.25C4.4703 9.25 3.9 9.68951 3.83879 10.3396C3.7639 11.1349 3.7654 12.2732 4.13328 13.4372C4.85399 15.7174 7.73342 18.25 7.73342 18.25"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M9.41183 21.2998H17.8574C23.1531 14.1426 19.3131 0.0716867 9.73622 3.26372L10.6287 5.39186L10.233 6.69549L11.399 7.65333L10.9023 9.67504L11.8958 11.1912L11.399 14.7292L7.75 18.1078C7.75 20.236 9.41183 21.2998 9.41183 21.2998Z"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M6.89045 3.53518L6.40769 2.28C6.34281 2.11131 6.18074 2 6 2C5.81926 2 5.65719 2.11131 5.59231 2.28L5.10955 3.53518C5.00797 3.79927 4.79927 4.00797 4.53518 4.10955L3.28 4.59231C3.11131 4.65719 3 4.81926 3 5C3 5.18074 3.11131 5.34281 3.28 5.40769L4.53518 5.89045C4.79927 5.99203 5.00797 6.20073 5.10955 6.46482L5.59231 7.72C5.65719 7.88869 5.81926 8 6 8C6.18074 8 6.34281 7.88869 6.40769 7.72L6.89045 6.46482C6.99203 6.20073 7.20073 5.99203 7.46482 5.89045L8.72 5.40769C8.88869 5.34281 9 5.18074 9 5C9 4.81926 8.88869 4.65719 8.72 4.59231L7.46482 4.10955C7.20073 4.00797 6.99203 3.79927 6.89045 3.53518Z"
              fill="currentColor"
            />
          </svg>
        </div>

        {/* Title */}
        <h2
          style={{
            fontSize: 22,
            margin: '0 0 8px',
            color: colors.textPrimary,
          }}>
          Issue reported
        </h2>

        {/* Subtitle */}
        <p
          style={{
            fontSize: 13,
            color: 'rgba(241,245,249,0.45)',
            margin: '0 0 24px',
            lineHeight: 1.5,
            maxWidth: 260,
          }}>
          Now use your favorite claw to fix this issue properly.
        </p>

        {/* View on GitHub button */}
        <a
          href={successUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => onSuccess()}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 20px',
            background: 'linear-gradient(135deg, #7c3aed, #9333ea)',
            color: '#fff',
            borderRadius: 10,
            fontSize: 14,
            fontWeight: 600,
            textDecoration: 'none',
            transition: 'all 0.15s',
            boxShadow: '0 4px 16px rgba(139,92,246,0.3)',
          }}>
          View on GitHub
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M9.75027 5.52371L10.7168 4.55722C13.1264 2.14759 17.0332 2.14759 19.4428 4.55722C21.8524 6.96684 21.8524 10.8736 19.4428 13.2832L18.4742 14.2519M5.52886 9.74513L4.55722 10.7168C2.14759 13.1264 2.1476 17.0332 4.55722 19.4428C6.96684 21.8524 10.8736 21.8524 13.2832 19.4428L14.2478 18.4782M9.5 14.5L14.5 9.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </a>

        {/* Back link */}
        <button
          onClick={onSuccess}
          style={{
            background: 'none',
            border: 'none',
            color: 'rgba(241,245,249,0.3)',
            fontSize: 12,
            cursor: 'pointer',
            marginTop: 16,
            padding: 0,
            transition: 'all 0.15s',
          }}>
          Report another issue
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        flex: 1,
        background: colors.bgPrimary,
        color: colors.textPrimary,
        boxSizing: 'border-box',
        minHeight: '100%',
      }}>
      {/* Header */}
      <div style={{ padding: '28px 20px 0', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          onClick={onBack}
          style={{
            background: 'none',
            border: 'none',
            color: colors.textPrimary,
            cursor: 'pointer',
            fontSize: 20,
            padding: '0 4px',
            lineHeight: 1,
            display: 'flex',
            alignItems: 'center',
            transition: 'all 0.15s',
          }}
          aria-label="Back">
          &#8592;
        </button>
        <h1
          style={{
            fontSize: 26,
            margin: 0,
            color: colors.textPrimary,
            lineHeight: 1.2,
          }}>
          Create Issue
        </h1>
      </div>

      <div style={{ padding: '12px 20px 20px' }}>
        {/* Description */}
        <span style={{ fontSize: 12, color: 'rgba(241,245,249,0.4)', marginBottom: 6, display: 'block' }}>
          Description
        </span>
        <textarea
          placeholder="Describe the issue..."
          value={description}
          onChange={e => setDescription(e.target.value)}
          style={{
            width: '100%',
            minHeight: 100,
            background: colors.inputBg,
            border: `1px solid ${colors.border}`,
            borderRadius: 8,
            padding: '12px 14px',
            color: colors.textPrimary,
            fontSize: 14,
            outline: 'none',
            resize: 'vertical',
            boxSizing: 'border-box',
            transition: 'all 0.15s',
          }}
        />

        {/* Labels & Assignee */}
        {selectedRepo && (
          <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
            <LabelSelect repo={selectedRepo} selected={selectedLabels} onChange={setSelectedLabels} />
            <AssigneeSelect repo={selectedRepo} selected={selectedAssignee} onChange={setSelectedAssignee} />
          </div>
        )}

        {/* Error message */}
        {error && (
          <div
            style={{
              marginTop: 12,
              padding: '10px 14px',
              background: 'rgba(248,113,113,0.1)',
              border: `1px solid rgba(248,113,113,0.3)`,
              borderRadius: 8,
              fontSize: 13,
              color: colors.error,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
            <span>{error}</span>
            <button
              onClick={() => {
                setError('');
                void handleSubmit();
              }}
              style={{
                background: 'none',
                border: 'none',
                color: colors.error,
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 600,
                textDecoration: 'underline',
                padding: 0,
                flexShrink: 0,
                marginLeft: 8,
                transition: 'all 0.15s',
              }}>
              Retry
            </button>
          </div>
        )}

        {/* Browser & Environment info */}
        {liveBrowserMetadata && (
          <>
            <span
              style={{
                fontSize: 12,
                color: 'rgba(241,245,249,0.4)',
                marginTop: 14,
                marginBottom: 6,
                display: 'block',
              }}>
              Environment
            </span>
            <div
              style={{
                padding: '10px 12px',
                background: 'rgba(148,163,184,0.05)',
                border: `1px solid ${colors.border}`,
                borderRadius: 8,
                fontSize: 11,
                color: colors.textSecondary,
                lineHeight: 1.7,
              }}>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ background: 'rgba(148,163,184,0.1)', padding: '2px 6px', borderRadius: 4 }}>
                  {liveBrowserMetadata.browser.name} {liveBrowserMetadata.browser.version}
                </span>
                <span style={{ background: 'rgba(148,163,184,0.1)', padding: '2px 6px', borderRadius: 4 }}>
                  {liveBrowserMetadata.os.name} {liveBrowserMetadata.os.version}
                </span>
                <span style={{ background: 'rgba(148,163,184,0.1)', padding: '2px 6px', borderRadius: 4 }}>
                  {liveBrowserMetadata.device.screenWidth}×{liveBrowserMetadata.device.screenHeight} @
                  {liveBrowserMetadata.device.pixelRatio}x
                </span>
                <span style={{ background: 'rgba(148,163,184,0.1)', padding: '2px 6px', borderRadius: 4 }}>
                  {liveBrowserMetadata.device.colorScheme}
                </span>
              </div>
              {liveBrowserMetadata.shopify && (
                <div
                  style={{
                    marginTop: 8,
                    paddingTop: 8,
                    borderTop: `1px solid ${colors.border}`,
                    display: 'flex',
                    gap: 6,
                    flexWrap: 'wrap',
                  }}>
                  <span
                    style={{
                      background: 'rgba(139,92,246,0.1)',
                      color: '#c4b5fd',
                      padding: '2px 6px',
                      borderRadius: 4,
                    }}>
                    {liveBrowserMetadata.shopify.storeName}
                  </span>
                  <span
                    style={{
                      background: 'rgba(139,92,246,0.1)',
                      color: '#c4b5fd',
                      padding: '2px 6px',
                      borderRadius: 4,
                    }}>
                    {liveBrowserMetadata.shopify.environment}
                  </span>
                  {liveBrowserMetadata.shopify.template && (
                    <span
                      style={{
                        background: 'rgba(139,92,246,0.1)',
                        color: '#c4b5fd',
                        padding: '2px 6px',
                        borderRadius: 4,
                      }}>
                      {liveBrowserMetadata.shopify.template}
                    </span>
                  )}
                  {liveBrowserMetadata.shopify.themeName && (
                    <span
                      style={{
                        background: 'rgba(139,92,246,0.1)',
                        color: '#c4b5fd',
                        padding: '2px 6px',
                        borderRadius: 4,
                      }}>
                      {liveBrowserMetadata.shopify.themeName}
                    </span>
                  )}
                  {liveBrowserMetadata.shopify.themeId && (
                    <span style={{ background: 'rgba(148,163,184,0.1)', padding: '2px 6px', borderRadius: 4 }}>
                      Theme #{liveBrowserMetadata.shopify.themeId}
                    </span>
                  )}
                </div>
              )}
              {liveBrowserMetadata.consoleErrors.length > 0 && (
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${colors.border}`, color: '#f87171' }}>
                  {liveBrowserMetadata.consoleErrors.length} console{' '}
                  {liveBrowserMetadata.consoleErrors.length === 1 ? 'error' : 'errors'} detected
                </div>
              )}
            </div>
          </>
        )}

        {/* Auto-fix checkbox */}
        {autoFixAvailable && (
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              marginTop: 16,
              padding: '12px 14px',
              background: autoFixChecked ? 'rgba(139,92,246,0.12)' : 'rgba(148,163,184,0.05)',
              border: `1px solid ${autoFixChecked ? 'rgba(139,92,246,0.3)' : colors.border}`,
              borderRadius: 8,
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}>
            <input
              type="checkbox"
              checked={autoFixChecked}
              onChange={e => setAutoFixChecked(e.target.checked)}
              aria-label="Auto-fix with Claude"
              style={{
                width: 18,
                height: 18,
                accentColor: '#a78bfa',
                cursor: 'pointer',
              }}
            />
            <span>
              <span style={{ display: 'block', color: colors.textPrimary, fontSize: 14, fontWeight: 500 }}>
                ✨ Auto-fix with Claude
              </span>
              <span style={{ display: 'block', margin: '2px 0 0', fontSize: 11, color: colors.textSecondary }}>
                Claude will analyze this issue and create a PR with a fix
              </span>
            </span>
          </label>
        )}

        {/* Submit button */}
        <button
          onClick={() => void handleSubmit()}
          disabled={submitting || !selectedRepo}
          style={{
            width: '100%',
            marginTop: 16,
            background:
              submitting || !selectedRepo ? 'rgba(124,58,237,0.4)' : 'linear-gradient(135deg, #7c3aed, #9333ea)',
            border: 'none',
            borderRadius: 10,
            padding: '13px',
            color: '#fff',
            fontSize: 15,
            fontWeight: 500,
            cursor: submitting || !selectedRepo ? 'not-allowed' : 'pointer',
            textAlign: 'center' as const,
            transition: 'all 0.15s',
          }}>
          {submitting ? 'Submitting...' : 'Submit Issue'}
        </button>

        {/* Shortcut hint */}
        <p style={{ marginTop: 8, fontSize: 12, color: colors.textMuted, textAlign: 'center' }}>{'\u2318'} + Enter</p>
      </div>
    </div>
  );
}
