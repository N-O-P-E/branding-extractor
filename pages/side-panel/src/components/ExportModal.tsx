import { exportAsCss, exportAsTokens, exportAsTailwind } from '@extension/exporter';
import { useCallback, useEffect, useState } from 'react';
import type { ExtractionResult } from '@extension/extractor';

interface Props {
  result: ExtractionResult;
  onClose: () => void;
}

type Format = 'tokens' | 'css' | 'tailwind';

const FORMAT_META: Record<Format, { label: string; filename: string; mime: string }> = {
  tokens: { label: 'JSON Tokens', filename: 'tokens.json', mime: 'application/json' },
  css: { label: 'CSS Variables', filename: 'variables.css', mime: 'text/css' },
  tailwind: { label: 'Tailwind Config', filename: 'tailwind.config.js', mime: 'text/javascript' },
};

export const ExportModal = ({ result, onClose }: Props) => {
  const [activeFormat, setActiveFormat] = useState<Format>('tokens');
  const [copied, setCopied] = useState(false);
  const getContent = useCallback(
    (format: Format): string => {
      if (format === 'tokens') return exportAsTokens(result);
      if (format === 'css') return exportAsCss(result);
      return exportAsTailwind(result);
    },
    [result],
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
