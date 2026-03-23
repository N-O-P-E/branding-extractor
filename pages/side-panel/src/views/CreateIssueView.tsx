import AssigneeSelect from '../components/AssigneeSelect';
import LabelSelect from '../components/LabelSelect';
import { useState, useEffect, useCallback } from 'react';
import type { BrowserMetadata } from '@extension/shared';

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
  captureData: CaptureData;
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

export default function CreateIssueView({ captureData, onBack, onSuccess }: CreateIssueViewProps) {
  const [description, setDescription] = useState('');
  const [selectedLabels, setSelectedLabels] = useState<string[]>([]);
  const [selectedAssignee, setSelectedAssignee] = useState('');
  const [selectedRepo, setSelectedRepo] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [successUrl, setSuccessUrl] = useState('');
  const [metadataOpen, setMetadataOpen] = useState(false);

  useEffect(() => {
    chrome.storage.sync.get('selectedRepo').then(result => {
      if (result.selectedRepo) setSelectedRepo(result.selectedRepo as string);
    });
  }, []);

  const handleSubmit = useCallback(async () => {
    if (submitting || !selectedRepo) return;
    setSubmitting(true);
    setError('');

    try {
      const response = (await chrome.runtime.sendMessage({
        type: 'CREATE_ISSUE',
        payload: {
          description,
          screenshotDataUrl: captureData.screenshotDataUrl,
          annotatedScreenshotDataUrl: captureData.annotatedScreenshotDataUrl,
          region: captureData.region,
          pageUrl: captureData.pageUrl,
          viewportWidth: captureData.viewportWidth,
          viewportHeight: captureData.viewportHeight,
          htmlSnippet: captureData.htmlSnippet,
          browserMetadata: captureData.browserMetadata,
          labels: selectedLabels,
          assignee: selectedAssignee || undefined,
        },
      })) as { success: boolean; issueUrl?: string; error?: string };

      if (response?.success) {
        setSuccessUrl(response.issueUrl ?? '');
        setTimeout(() => {
          onSuccess();
        }, 2000);
      } else {
        setError(response?.error ?? 'Failed to create issue');
        setSubmitting(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create issue');
      setSubmitting(false);
    }
  }, [submitting, selectedRepo, description, captureData, selectedLabels, selectedAssignee, onSuccess]);

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
          background: colors.bgPrimary,
          color: colors.textPrimary,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 20,
          gap: 12,
        }}>
        <div style={{ fontSize: 40 }}>&#10003;</div>
        <p style={{ fontSize: 16, color: colors.success, margin: 0, fontWeight: 500 }}>Issue created!</p>
        <a
          href={successUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontSize: 13, color: '#a78bfa', textDecoration: 'underline' }}>
          View on GitHub
        </a>
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

      <div style={{ padding: '20px' }}>
        {/* Screenshot preview */}
        <img
          src={captureData.annotatedScreenshotDataUrl}
          alt="Screenshot preview"
          style={{
            width: '100%',
            borderRadius: 8,
            border: `1px solid ${colors.border}`,
            display: 'block',
          }}
        />

        {/* Shopify links */}
        {captureData.browserMetadata?.shopify?.editorUrl && (
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            {captureData.browserMetadata.shopify.editorUrl && (
              <a
                href={captureData.browserMetadata.shopify.editorUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  background: 'rgba(167,139,250,0.15)',
                  border: '1px solid rgba(167,139,250,0.3)',
                  borderRadius: 8,
                  color: '#c4b5fd',
                  fontSize: 12,
                  fontWeight: 500,
                  textDecoration: 'none',
                  textAlign: 'center' as const,
                  transition: 'all 0.15s',
                }}>
                Open in Editor
              </a>
            )}
            {captureData.browserMetadata.shopify.previewUrl && (
              <a
                href={captureData.browserMetadata.shopify.previewUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  background: 'rgba(167,139,250,0.15)',
                  border: '1px solid rgba(167,139,250,0.3)',
                  borderRadius: 8,
                  color: '#c4b5fd',
                  fontSize: 12,
                  fontWeight: 500,
                  textDecoration: 'none',
                  textAlign: 'center' as const,
                  transition: 'all 0.15s',
                }}>
                Preview
              </a>
            )}
          </div>
        )}

        {/* Description */}
        <textarea
          placeholder="Describe the issue..."
          value={description}
          onChange={e => setDescription(e.target.value)}
          style={{
            width: '100%',
            minHeight: 100,
            marginTop: 16,
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
          <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
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

        {/* Metadata accordion */}
        {captureData.browserMetadata && (
          <div style={{ marginTop: 16 }}>
            <button
              onClick={() => setMetadataOpen(prev => !prev)}
              style={{
                width: '100%',
                background: 'none',
                border: `1px solid ${colors.border}`,
                borderRadius: metadataOpen ? '8px 8px 0 0' : 8,
                padding: '10px 14px',
                color: colors.textSecondary,
                fontSize: 12,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                transition: 'all 0.15s',
              }}>
              <span>Browser & Environment</span>
              <span
                style={{ transform: metadataOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
                &#9660;
              </span>
            </button>
            {metadataOpen && (
              <div
                style={{
                  padding: '12px 14px',
                  fontSize: 11,
                  color: colors.textSecondary,
                  lineHeight: 1.8,
                  borderLeft: `1px solid ${colors.border}`,
                  borderRight: `1px solid ${colors.border}`,
                  borderBottom: `1px solid ${colors.border}`,
                  borderRadius: '0 0 8px 8px',
                }}>
                <div>
                  <strong>Browser:</strong> {captureData.browserMetadata.browser.name}{' '}
                  {captureData.browserMetadata.browser.version} ({captureData.browserMetadata.browser.engine})
                </div>
                <div>
                  <strong>OS:</strong> {captureData.browserMetadata.os.name} {captureData.browserMetadata.os.version}
                </div>
                <div>
                  <strong>Device:</strong> {captureData.browserMetadata.device.type} (
                  {captureData.browserMetadata.device.screenWidth}x{captureData.browserMetadata.device.screenHeight} @
                  {captureData.browserMetadata.device.pixelRatio}x)
                </div>
                <div>
                  <strong>Viewport:</strong> {captureData.viewportWidth}x{captureData.viewportHeight}
                </div>
                <div>
                  <strong>Zoom:</strong> {captureData.browserMetadata.page.zoomLevel}%
                </div>
                <div>
                  <strong>Color Scheme:</strong> {captureData.browserMetadata.device.colorScheme}
                </div>
                <div>
                  <strong>Page Title:</strong> {captureData.browserMetadata.page.title}
                </div>
                <div>
                  <strong>Language:</strong> {captureData.browserMetadata.page.language}
                </div>
                <div>
                  <strong>Connection:</strong> {captureData.browserMetadata.network.online ? 'online' : 'offline'}
                  {captureData.browserMetadata.network.connectionType
                    ? ` (${captureData.browserMetadata.network.connectionType})`
                    : ''}
                </div>
                {captureData.browserMetadata.shopify && (
                  <>
                    <div style={{ marginTop: 8, fontWeight: 600, color: colors.textPrimary }}>Shopify</div>
                    <div>
                      <strong>Store:</strong> {captureData.browserMetadata.shopify.storeName} (
                      {captureData.browserMetadata.shopify.storeHandle})
                    </div>
                    {captureData.browserMetadata.shopify.themeName && (
                      <div>
                        <strong>Theme:</strong> {captureData.browserMetadata.shopify.themeName}
                      </div>
                    )}
                    {captureData.browserMetadata.shopify.themeId && (
                      <div>
                        <strong>Theme ID:</strong> {captureData.browserMetadata.shopify.themeId}
                      </div>
                    )}
                    <div>
                      <strong>Environment:</strong> {captureData.browserMetadata.shopify.environment}
                    </div>
                    {captureData.browserMetadata.shopify.buildVersion && (
                      <div>
                        <strong>Build:</strong> {captureData.browserMetadata.shopify.buildVersion}
                      </div>
                    )}
                    {captureData.browserMetadata.shopify.locale && (
                      <div>
                        <strong>Locale:</strong> {captureData.browserMetadata.shopify.locale}
                      </div>
                    )}
                  </>
                )}
                {captureData.browserMetadata.consoleErrors.length > 0 && (
                  <>
                    <div style={{ marginTop: 8, fontWeight: 600, color: colors.textPrimary }}>
                      Console Errors ({captureData.browserMetadata.consoleErrors.length})
                    </div>
                    {captureData.browserMetadata.consoleErrors.slice(0, 10).map((err, i) => (
                      <div
                        key={i}
                        style={{
                          fontFamily: 'monospace',
                          fontSize: 10,
                          color: err.level === 'error' ? '#f87171' : '#fbbf24',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-all',
                        }}>
                        [{err.level}] {new Date(err.timestamp).toLocaleTimeString()} — {err.message}
                      </div>
                    ))}
                    {captureData.browserMetadata.consoleErrors.length > 10 && (
                      <div style={{ fontSize: 10, color: colors.textMuted }}>
                        ...and {captureData.browserMetadata.consoleErrors.length - 10} more
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
