import AssigneeSelect from '../components/AssigneeSelect';
import LabelSelect from '../components/LabelSelect';
import { useState, useEffect, useCallback, useRef } from 'react';
import type { VideoUploadStatus } from './HomeView';
import type { BrowserMetadata, AutoFixSettings, RecordingCompleteMessage } from '@extension/shared';

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
  recordingData?: RecordingCompleteMessage['payload'] | null;
  videoUploadStatus?: VideoUploadStatus | null;
  onBack: () => void;
  onSuccess: () => void;
  onOpenWizard?: (chapter: 1 | 2) => void;
}

const colors = {
  bgPrimary: 'var(--bg-primary)',
  inputBg: 'var(--bg-input)',
  border: 'var(--border-default)',
  textPrimary: 'var(--text-primary)',
  textSecondary: 'var(--text-secondary)',
  textMuted: 'var(--text-muted)',
  success: 'var(--status-success)',
  error: 'var(--status-error)',
} as const;

export default function CreateIssueView({
  captureData,
  browserMetadata,
  recordingData,
  videoUploadStatus,
  onBack,
  onSuccess,
  onOpenWizard,
}: CreateIssueViewProps) {
  const [description, setDescription] = useState('');
  const [selectedLabels, setSelectedLabels] = useState<string[]>([]);
  const [selectedAssignee, setSelectedAssignee] = useState('');
  const [selectedRepo, setSelectedRepo] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [successUrl, setSuccessUrl] = useState('');
  const [autoFixResult, setAutoFixResult] = useState<string | null>(null);
  const [autoFixError, setAutoFixError] = useState<string | null>(null);

  // Auto-fix state
  const [autoFixAvailable, setAutoFixAvailable] = useState(false);
  const [autoFixChecked, setAutoFixChecked] = useState(false);
  const [repoHasSecret, setRepoHasSecret] = useState<boolean | null>(null);
  const [selectedBranch, setSelectedBranch] = useState('');

  const [liveBrowserMetadata, setLiveBrowserMetadata] = useState<BrowserMetadata | null>(browserMetadata);

  useEffect(() => {
    chrome.storage.local.get(['selectedRepo', 'selectedBranch']).then(result => {
      if (result.selectedRepo) setSelectedRepo(result.selectedRepo as string);
      if (result.selectedBranch) setSelectedBranch(result.selectedBranch as string);
    });
    // Check if auto-fix is available and load default preference
    chrome.storage.local.get('autoFixSettings').then(result => {
      if (result.autoFixSettings) {
        const settings = result.autoFixSettings as AutoFixSettings;
        const available = !!settings.anthropicApiKey;
        setAutoFixAvailable(available);
        if (settings.autoFixByDefault) setAutoFixChecked(true);
      }
    });
  }, []);

  // Check if selected repo has the ANTHROPIC_API_KEY secret
  useEffect(() => {
    if (!autoFixAvailable || !selectedRepo) return;
    setRepoHasSecret(null);
    chrome.runtime.sendMessage(
      { type: 'CHECK_REPO_SECRET', payload: { repo: selectedRepo, secretName: 'ANTHROPIC_API_KEY' } },
      (response: { success: boolean; exists?: boolean }) => {
        if (response?.success) {
          const exists = !!response.exists;
          setRepoHasSecret(exists);
          // Read fresh from storage to avoid stale state
          chrome.storage.local.get('autoFixSettings').then(result => {
            const s = result.autoFixSettings as AutoFixSettings | undefined;
            if (exists && s?.autoFixByDefault) setAutoFixChecked(true);
            else if (!exists) setAutoFixChecked(false);
          });
        }
      },
    );
  }, [autoFixAvailable, selectedRepo]);

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
      if (!data && recordingData) {
        // Recording-only flow: take a quick screenshot as thumbnail for the issue
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const pageUrl = recordingData.pageUrl || tab?.url || '';
        const screenshotDataUrl = tab?.windowId
          ? await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'jpeg', quality: 80 })
          : '';
        data = {
          screenshotDataUrl,
          annotatedScreenshotDataUrl: screenshotDataUrl,
          pageUrl,
          viewportWidth: window.screen.width,
          viewportHeight: window.screen.height,
        };
      } else if (!data) {
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
          branch: selectedBranch || undefined,
          autoFix: autoFixChecked && autoFixAvailable,
          ...(recordingData?.videoUrl
            ? {
                videoUrl: recordingData.videoUrl,
                videoDurationMs: recordingData.durationMs,
              }
            : {}),
        },
      })) as { success: boolean; issueUrl?: string; error?: string; autoFixResult?: string; autoFixError?: string };

      if (response?.success) {
        setSuccessUrl(response.issueUrl ?? '');
        if (response.autoFixResult) {
          setAutoFixResult(response.autoFixResult);
          if (response.autoFixError) {
            setAutoFixError(response.autoFixError);
            console.error('[VIR] Auto-fix error:', response.autoFixError);
          }
        }
      } else {
        setError(response?.error ?? 'Failed to create issue');
        setSubmitting(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create issue');
      setSubmitting(false);
    }
  }, [
    submitting,
    selectedRepo,
    description,
    selectedLabels,
    selectedAssignee,
    selectedBranch,
    autoFixChecked,
    autoFixAvailable,
    recordingData,
  ]);

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
            background: 'var(--accent-10)',
            border: '1px solid var(--accent-20)',
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
            style={{ color: 'var(--accent-subtle)' }}>
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

        {/* Subtitle — context-aware based on auto-fix result */}
        <p
          style={{
            fontSize: 13,
            color: 'var(--text-secondary)',
            margin: '0 0 24px',
            lineHeight: 1.5,
            maxWidth: 280,
          }}>
          {autoFixResult === 'triggered'
            ? 'Claude Code is analyzing the issue and will open a PR with the fix.'
            : autoFixResult === 'no-workflow'
              ? 'Issue labeled for auto-fix, but the workflow file is missing. Add it via Settings to enable Claude Code.'
              : autoFixResult === 'failed'
                ? `Auto-fix setup failed${autoFixError ? `: ${autoFixError}` : '.'}`
                : 'Now use your favorite claw to fix this issue properly.'}
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
            background: 'var(--accent-gradient)',
            color: 'var(--text-on-accent)',
            borderRadius: 10,
            fontSize: 14,
            fontWeight: 600,
            textDecoration: 'none',
            transition: 'all 0.15s',
            boxShadow: '0 4px 16px var(--accent-15)',
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
            color: 'var(--text-muted)',
            fontSize: 12,
            cursor: 'pointer',
            marginTop: 16,
            padding: 0,
            transition: 'all 0.15s',
          }}>
          Report another issue
        </button>
        {autoFixResult === 'no-workflow' && (
          <button
            onClick={() => onOpenWizard?.(2)}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--accent-link)',
              fontSize: 12,
              cursor: 'pointer',
              marginTop: 8,
              textDecoration: 'underline',
            }}>
            Complete Claude Code setup
          </button>
        )}
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
        {/* Video upload status */}
        {videoUploadStatus && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 14px',
              marginBottom: 12,
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 500,
              background:
                videoUploadStatus.status === 'uploading'
                  ? 'var(--bg-input)'
                  : videoUploadStatus.status === 'success'
                    ? 'rgba(34, 197, 94, 0.1)'
                    : 'rgba(239, 68, 68, 0.1)',
              color:
                videoUploadStatus.status === 'uploading'
                  ? 'var(--text-secondary)'
                  : videoUploadStatus.status === 'success'
                    ? 'var(--status-success)'
                    : 'var(--status-error)',
              border: `1px solid ${
                videoUploadStatus.status === 'uploading'
                  ? 'var(--border-default)'
                  : videoUploadStatus.status === 'success'
                    ? 'rgba(34, 197, 94, 0.2)'
                    : 'rgba(239, 68, 68, 0.2)'
              }`,
            }}>
            {videoUploadStatus.status === 'uploading' && (
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }}>
                <path
                  d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            )}
            <span>
              {videoUploadStatus.status === 'uploading' && 'Uploading recording...'}
              {videoUploadStatus.status === 'success' && 'Recording uploaded'}
              {videoUploadStatus.status === 'error' &&
                `Recording upload failed${videoUploadStatus.error ? `: ${videoUploadStatus.error}` : ''}`}
            </span>
          </div>
        )}

        {/* Description */}
        <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6, display: 'block' }}>
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
              background: 'var(--error-10)',
              border: `1px solid var(--error-30)`,
              borderRadius: 8,
              fontSize: 12,
              color: colors.error,
              lineHeight: 1.5,
              wordBreak: 'break-word' as const,
            }}>
            <span
              dangerouslySetInnerHTML={{
                __html: error.replace(
                  /(https?:\/\/[^\s]+)/g,
                  '<a href="$1" target="_blank" rel="noopener noreferrer" style="color:#c4b5fd;word-break:break-all">$1</a>',
                ),
              }}
            />
            <button
              onClick={() => {
                setError('');
                void handleSubmit();
              }}
              style={{
                background: 'none',
                border: 'none',
                color: colors.textMuted,
                cursor: 'pointer',
                fontSize: 11,
                textDecoration: 'underline',
                padding: 0,
                marginTop: 6,
                display: 'block',
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
                color: 'var(--text-secondary)',
                marginTop: 14,
                marginBottom: 6,
                display: 'block',
              }}>
              Environment
            </span>
            <div
              style={{
                padding: '10px 12px',
                background: 'var(--bg-input)',
                border: `1px solid ${colors.border}`,
                borderRadius: 8,
                fontSize: 11,
                color: colors.textSecondary,
                lineHeight: 1.7,
              }}>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ background: 'var(--border-subtle)', padding: '2px 6px', borderRadius: 4 }}>
                  {liveBrowserMetadata.browser.name} {liveBrowserMetadata.browser.version}
                </span>
                <span style={{ background: 'var(--border-subtle)', padding: '2px 6px', borderRadius: 4 }}>
                  {liveBrowserMetadata.os.name} {liveBrowserMetadata.os.version}
                </span>
                <span style={{ background: 'var(--border-subtle)', padding: '2px 6px', borderRadius: 4 }}>
                  {liveBrowserMetadata.device.screenWidth}×{liveBrowserMetadata.device.screenHeight} @
                  {liveBrowserMetadata.device.pixelRatio}x
                </span>
                <span style={{ background: 'var(--border-subtle)', padding: '2px 6px', borderRadius: 4 }}>
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
                      background: 'var(--accent-10)',
                      color: 'var(--accent-link)',
                      padding: '2px 6px',
                      borderRadius: 4,
                    }}>
                    {liveBrowserMetadata.shopify.storeName}
                  </span>
                  <span
                    style={{
                      background: 'var(--accent-10)',
                      color: 'var(--accent-link)',
                      padding: '2px 6px',
                      borderRadius: 4,
                    }}>
                    {liveBrowserMetadata.shopify.environment}
                  </span>
                  {liveBrowserMetadata.shopify.template && (
                    <span
                      style={{
                        background: 'var(--accent-10)',
                        color: 'var(--accent-link)',
                        padding: '2px 6px',
                        borderRadius: 4,
                      }}>
                      {liveBrowserMetadata.shopify.template}
                    </span>
                  )}
                  {liveBrowserMetadata.shopify.themeName && (
                    <span
                      style={{
                        background: 'var(--accent-10)',
                        color: 'var(--accent-link)',
                        padding: '2px 6px',
                        borderRadius: 4,
                      }}>
                      {liveBrowserMetadata.shopify.themeName}
                    </span>
                  )}
                  {liveBrowserMetadata.shopify.themeId && (
                    <span style={{ background: 'var(--border-subtle)', padding: '2px 6px', borderRadius: 4 }}>
                      Theme #{liveBrowserMetadata.shopify.themeId}
                    </span>
                  )}
                </div>
              )}
              {liveBrowserMetadata.consoleErrors.length > 0 && (
                <div
                  style={{
                    marginTop: 8,
                    paddingTop: 8,
                    borderTop: `1px solid ${colors.border}`,
                    color: colors.textSecondary,
                    fontSize: 11,
                  }}>
                  {liveBrowserMetadata.consoleErrors.length} console{' '}
                  {liveBrowserMetadata.consoleErrors.length === 1 ? 'error' : 'errors'} detected
                </div>
              )}
            </div>
          </>
        )}

        {/* Submit button */}
        <button
          onClick={() => void handleSubmit()}
          disabled={submitting || !selectedRepo}
          style={{
            width: '100%',
            marginTop: 16,
            background: submitting || !selectedRepo ? 'var(--accent-gradient-disabled)' : 'var(--accent-gradient)',
            border: 'none',
            borderRadius: 10,
            padding: '13px',
            color: 'var(--text-on-accent)',
            fontSize: 15,
            fontWeight: 500,
            cursor: submitting || !selectedRepo ? 'not-allowed' : 'pointer',
            textAlign: 'center' as const,
            transition: 'all 0.15s',
          }}>
          {submitting ? (
            'Submitting...'
          ) : (
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
              Submit Issue
              <span
                style={{
                  fontSize: 11,
                  opacity: 0.6,
                  background: 'rgba(255,255,255,0.15)',
                  padding: '2px 8px',
                  borderRadius: 5,
                  fontWeight: 400,
                  letterSpacing: '0.02em',
                }}>
                {'\u2318'} + Enter
              </span>
            </span>
          )}
        </button>

        {/* Auto-fix toggle — inline below submit */}
        {autoFixAvailable && (
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginTop: 12,
              cursor: repoHasSecret === false ? 'default' : 'pointer',
              padding: '0 2px',
              opacity: repoHasSecret === false ? 0.45 : 1,
              transition: 'opacity 0.15s',
            }}
            title={repoHasSecret === false ? 'Add ANTHROPIC_API_KEY secret to this repo in Settings first' : undefined}>
            <span
              style={{
                fontSize: 13,
                color: autoFixChecked ? colors.textPrimary : colors.textSecondary,
                transition: 'color 0.15s',
              }}>
              Auto-fix with Claude Code
              {repoHasSecret === false && (
                <span style={{ display: 'block', fontSize: 10, color: colors.textMuted, marginTop: 1 }}>
                  Secret missing on this repo
                </span>
              )}
            </span>
            {/* Toggle switch */}
            <div
              style={{
                position: 'relative',
                width: 36,
                height: 20,
                borderRadius: 10,
                background: autoFixChecked ? 'var(--accent-hover)' : 'var(--border-default)',
                transition: 'background 0.2s',
                flexShrink: 0,
              }}>
              <div
                style={{
                  position: 'absolute',
                  top: 2,
                  left: autoFixChecked ? 18 : 2,
                  width: 16,
                  height: 16,
                  borderRadius: '50%',
                  background: 'var(--text-on-accent)',
                  transition: 'left 0.2s ease',
                  boxShadow: '0 1px 3px var(--shadow-dropdown)',
                }}
              />
            </div>
            <input
              type="checkbox"
              checked={autoFixChecked}
              disabled={repoHasSecret === false}
              onChange={e => {
                if (repoHasSecret !== false) setAutoFixChecked(e.target.checked);
              }}
              aria-label="Auto-fix with Claude Code"
              style={{ position: 'absolute', opacity: 0, pointerEvents: 'none' }}
            />
          </label>
        )}
      </div>
    </div>
  );
}
