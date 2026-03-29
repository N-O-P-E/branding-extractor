import { exportAsCss, exportAsSession, exportAsTokens, exportAsTailwind } from '@extension/exporter';
import { useCallback, useEffect, useState } from 'react';
import type { ExtractionResult, TokenOverride } from '@extension/extractor';

interface Props {
  result: ExtractionResult;
  onClose: () => void;
  overrides?: TokenOverride[];
}

type Format = 'tokens' | 'css' | 'tailwind' | 'session';

const FORMAT_META: Record<Format, { label: string; filename: string; mime: string }> = {
  tokens: { label: 'JSON Tokens', filename: 'tokens.json', mime: 'application/json' },
  css: { label: 'CSS Variables', filename: 'variables.css', mime: 'text/css' },
  tailwind: { label: 'Tailwind Config', filename: 'tailwind.config.js', mime: 'text/javascript' },
  session: { label: 'Session', filename: 'branding.branding.json', mime: 'application/json' },
};

export const ExportModal = ({ result, onClose, overrides }: Props) => {
  const [activeFormat, setActiveFormat] = useState<Format>('tokens');
  const [copied, setCopied] = useState(false);
  const [useModified, setUseModified] = useState(false);
  const [screenshotBefore, setScreenshotBefore] = useState<string | undefined>(undefined);
  const [screenshotAfter, setScreenshotAfter] = useState<string | undefined>(undefined);
  const [capturingScreenshots, setCapturingScreenshots] = useState(false);

  const hasOverrides = overrides !== undefined && overrides.length > 0;
  const activeOverrides = hasOverrides && useModified ? overrides : undefined;

  /** Capture full page via CDP (no scrolling, single shot). */
  const captureFullPage = useCallback(async (tabId: number): Promise<string> => {
    const response = await chrome.runtime.sendMessage({
      type: 'CAPTURE_FULL_PAGE',
      payload: { tabId },
    });
    if (!response?.dataUrl) throw new Error(response?.error ?? 'Capture failed');
    return response.dataUrl;
  }, []);

  const handleCaptureScreenshots = useCallback(async () => {
    setCapturingScreenshots(true);
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) return;

      // Capture "before" — temporarily disable overrides
      await chrome.tabs.sendMessage(tab.id, { type: 'SET_OVERRIDES_ENABLED', payload: { enabled: false } });
      await new Promise(r => setTimeout(r, 400));
      const before = await captureFullPage(tab.id);
      setScreenshotBefore(before);

      // Restore overrides and capture "after"
      await chrome.tabs.sendMessage(tab.id, { type: 'SET_OVERRIDES_ENABLED', payload: { enabled: true } });
      await new Promise(r => setTimeout(r, 400));
      const after = await captureFullPage(tab.id);
      setScreenshotAfter(after);
    } catch (err) {
      console.error('Screenshot capture failed:', err);
    } finally {
      setCapturingScreenshots(false);
    }
  }, [captureFullPage]);

  const getContent = useCallback(
    (format: Format): string => {
      if (format === 'tokens') return exportAsTokens(result, activeOverrides);
      if (format === 'css') return exportAsCss(result, activeOverrides);
      if (format === 'tailwind') return exportAsTailwind(result, activeOverrides);
      // session
      const origin = (() => {
        try {
          return new URL(result.url).origin;
        } catch {
          return result.url;
        }
      })();
      const name = (() => {
        try {
          return new URL(result.url).hostname;
        } catch {
          return 'branding';
        }
      })();
      const screenshots =
        screenshotBefore !== undefined || screenshotAfter !== undefined
          ? { before: screenshotBefore, after: screenshotAfter }
          : undefined;
      return exportAsSession(name, origin, result, activeOverrides ?? [], screenshots);
    },
    [result, activeOverrides, screenshotBefore, screenshotAfter],
  );

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(getContent(activeFormat));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [activeFormat, getContent]);

  const handleDownload = useCallback(() => {
    const meta = FORMAT_META[activeFormat];
    const blob = new Blob([getContent(activeFormat)], { type: meta.mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = meta.filename;
    a.click();
    URL.revokeObjectURL(url);
  }, [activeFormat, getContent]);

  // Close on Escape key
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const content = getContent(activeFormat);
  const formats = Object.entries(FORMAT_META) as [Format, (typeof FORMAT_META)[Format]][];

  return (
    <div
      className="absolute inset-0 z-50 flex items-end justify-center"
      role="dialog"
      aria-modal="true"
      aria-label="Export design tokens">
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close export modal"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/60"
        tabIndex={-1}
      />
      <div
        className="relative flex w-full flex-col rounded-t-2xl shadow-xl"
        style={{ maxHeight: '85vh', backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-default)' }}>
        {/* Modal header */}
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{ borderBottom: '1px solid var(--border-default)' }}>
          <h2
            className="text-sm font-semibold"
            style={{ fontFamily: 'var(--font-heading)', color: 'var(--text-primary)' }}>
            Export
          </h2>
          <div className="flex items-center gap-3">
            {/* Original / Modified toggle — only shown when overrides exist */}
            {hasOverrides && (
              <div className="flex items-center gap-1.5">
                <span
                  className="text-[11px]"
                  style={{ color: useModified ? 'var(--text-muted)' : 'var(--accent-subtle)' }}>
                  Original
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={useModified}
                  onClick={() => setUseModified(v => !v)}
                  className="relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full transition-colors"
                  style={{ backgroundColor: useModified ? 'var(--accent-primary)' : 'var(--border-default)' }}>
                  <span
                    className="pointer-events-none inline-block h-3 w-3 translate-y-0.5 rounded-full bg-white shadow transition-transform"
                    style={{ transform: `translateX(${useModified ? '14px' : '2px'})` }}
                  />
                </button>
                <span
                  className="text-[11px]"
                  style={{ color: useModified ? 'var(--accent-subtle)' : 'var(--text-muted)' }}>
                  Modified
                </span>
              </div>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded p-1 transition-colors"
              style={{ color: 'var(--text-muted)' }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--bg-secondary)';
                (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
                (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)';
              }}
              aria-label="Close export modal">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>

        {/* Format tabs */}
        <div className="flex" style={{ borderBottom: '1px solid var(--border-default)' }}>
          {formats.map(([id, meta]) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveFormat(id)}
              className="flex-1 py-2 text-xs font-medium transition-colors"
              style={
                activeFormat === id
                  ? {
                      borderBottom: '2px solid var(--accent-primary)',
                      color: 'var(--accent-subtle)',
                    }
                  : {
                      color: 'var(--text-secondary)',
                    }
              }>
              {meta.label}
            </button>
          ))}
        </div>

        {/* Session screenshot capture — only shown on the Session tab */}
        {activeFormat === 'session' && (
          <div className="flex flex-col gap-2 px-4 py-2" style={{ borderBottom: '1px solid var(--border-default)' }}>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleCaptureScreenshots}
                disabled={capturingScreenshots}
                className="rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50"
                style={{
                  border: '1px solid var(--accent-primary)',
                  color: 'var(--accent-subtle)',
                }}>
                {capturingScreenshots ? 'Capturing...' : 'Capture Before/After'}
              </button>
            </div>

            {/* Screenshot previews */}
            {(screenshotBefore || screenshotAfter) && (
              <div className="flex gap-2">
                {screenshotBefore && (
                  <div className="flex-1">
                    <p
                      className="mb-1 text-[9px] font-medium uppercase tracking-wider"
                      style={{ color: 'var(--text-muted)' }}>
                      Before
                    </p>
                    <img
                      src={screenshotBefore}
                      alt="Before"
                      className="w-full rounded border"
                      style={{ borderColor: 'var(--border-default)' }}
                    />
                    <a
                      href={screenshotBefore}
                      download="screenshot-before.png"
                      className="mt-1 inline-block text-[10px] transition-opacity hover:opacity-70"
                      style={{ color: 'var(--accent-subtle)' }}>
                      Download
                    </a>
                  </div>
                )}
                {screenshotAfter && (
                  <div className="flex-1">
                    <p
                      className="mb-1 text-[9px] font-medium uppercase tracking-wider"
                      style={{ color: 'var(--text-muted)' }}>
                      After
                    </p>
                    <img
                      src={screenshotAfter}
                      alt="After"
                      className="w-full rounded border"
                      style={{ borderColor: 'var(--border-default)' }}
                    />
                    <a
                      href={screenshotAfter}
                      download="screenshot-after.png"
                      className="mt-1 inline-block text-[10px] transition-opacity hover:opacity-70"
                      style={{ color: 'var(--accent-subtle)' }}>
                      Download
                    </a>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Code preview */}
        <div className="min-h-0 flex-1 overflow-y-auto" style={{ backgroundColor: 'var(--bg-secondary)' }}>
          <pre
            className="whitespace-pre-wrap break-all p-4 font-mono text-[10px] leading-relaxed"
            style={{ color: 'var(--text-secondary)' }}>
            {content}
          </pre>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2 px-4 py-3" style={{ borderTop: '1px solid var(--border-default)' }}>
          <button
            type="button"
            onClick={handleCopy}
            className="flex-1 rounded-lg py-2 text-xs font-medium transition-colors"
            style={{
              border: '1px solid var(--border-default)',
              color: 'var(--text-secondary)',
            }}
            onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--bg-secondary)')}
            onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent')}>
            {copied ? 'Copied!' : 'Copy'}
          </button>
          <button
            type="button"
            onClick={handleDownload}
            className="flex-1 rounded-lg py-2 text-xs font-medium text-white transition-colors"
            style={{ background: 'var(--accent-gradient)' }}>
            Download
          </button>
        </div>
      </div>
    </div>
  );
};
