import { AnimationList } from './components/AnimationList';
import { ColorSwatches } from './components/ColorSwatches';
import { ComponentList } from './components/ComponentList';
import { ExportModal } from './components/ExportModal';
import { SkeletonLoader } from './components/SkeletonLoader';
import { SpacingGrid } from './components/SpacingGrid';
import { TypographyList } from './components/TypographyList';
import { BrandingDetailView } from './views/BrandingDetailView';
import { BrandingsView } from './views/BrandingsView';
import { getBrandings, saveBranding } from '@extension/storage';
import { useCallback, useEffect, useState } from 'react';
import type { ExtractionResult } from '@extension/extractor';
import type { SavedBranding } from '@extension/storage';

type Tab = 'colors' | 'typography' | 'spacing' | 'components' | 'animations';

type View = { type: 'extract' } | { type: 'brandings' } | { type: 'detail'; branding: SavedBranding };

const SidePanel = () => {
  const [view, setView] = useState<View>({ type: 'extract' });
  const [activeTab, setActiveTab] = useState<Tab>('colors');
  const [result, setResult] = useState<ExtractionResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [brandings, setBrandings] = useState<SavedBranding[]>([]);
  const [savedToast, setSavedToast] = useState(false);

  useEffect(() => {
    getBrandings()
      .then(setBrandings)
      .catch((err: unknown) => console.error('Failed to load brandings:', err));
  }, []);

  const handleExtract = useCallback(async () => {
    setLoading(true);
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        const response = await chrome.tabs.sendMessage(tab.id, { type: 'EXTRACT_STYLES' });
        setResult(response.result);
        setView({ type: 'extract' });
      }
    } catch (err) {
      console.error('Extraction failed:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleCopy = useCallback(async (value: string) => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, []);

  const handleSaveCurrent = useCallback(async () => {
    if (!result) return;
    try {
      const hostname = new URL(result.url).hostname;
      const favicon = `https://www.google.com/s2/favicons?domain=${hostname}`;
      const newBranding: SavedBranding = {
        id: crypto.randomUUID(),
        name: hostname,
        url: result.url,
        favicon,
        data: result,
        savedAt: Date.now(),
      };
      await saveBranding(newBranding);
      const updated = await getBrandings();
      setBrandings(updated);
      setSavedToast(true);
      setTimeout(() => setSavedToast(false), 1500);
    } catch (err) {
      console.error('Failed to save branding:', err);
    }
  }, [result]);

  const handleBrandingDeleted = useCallback((id: string) => {
    setBrandings(prev => prev.filter(b => b.id !== id));
  }, []);

  const handleSelectBranding = useCallback((branding: SavedBranding) => {
    setView({ type: 'detail', branding });
  }, []);

  const handleBackFromDetail = useCallback(() => {
    setView({ type: 'brandings' });
  }, []);

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'colors', label: 'Colors', count: result?.colors.length },
    { id: 'typography', label: 'Type', count: result?.typography.length },
    { id: 'spacing', label: 'Spacing', count: result?.spacing.length },
    { id: 'components', label: 'Components', count: result?.components.length },
    { id: 'animations', label: 'Animations', count: result?.animations.length },
  ];

  const isExtractView = view.type === 'extract';
  const isBrandingsView = view.type === 'brandings';
  const isDetailView = view.type === 'detail';

  return (
    <div
      className="relative flex h-screen flex-col pb-14"
      style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
      {/* Header — hidden when viewing detail (detail has its own header) */}
      {!isDetailView && (
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{ borderBottom: '1px solid var(--border-default)' }}>
          <h1
            className="text-lg font-semibold"
            style={{ fontFamily: 'var(--font-heading)', color: 'var(--text-primary)' }}>
            Branding Extractor
          </h1>
          <div className="flex items-center gap-2">
            {/* Saved brandings toggle */}
            <button
              type="button"
              onClick={() => setView(isBrandingsView ? { type: 'extract' } : { type: 'brandings' })}
              aria-label={isBrandingsView ? 'Back to extraction' : 'View saved brandings'}
              className="rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
              style={
                isBrandingsView
                  ? {
                      border: '1px solid var(--accent-primary)',
                      background: 'var(--accent-10)',
                      color: 'var(--accent-subtle)',
                    }
                  : {
                      border: '1px solid var(--border-default)',
                      color: 'var(--text-secondary)',
                    }
              }>
              {isBrandingsView ? 'Extract' : `Saved${brandings.length > 0 ? ` (${brandings.length})` : ''}`}
            </button>

            {isExtractView && (
              <>
                {result && (
                  <>
                    <button
                      type="button"
                      onClick={handleSaveCurrent}
                      className="rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
                      style={{
                        border: '1px solid var(--accent-primary)',
                        color: 'var(--accent-subtle)',
                      }}>
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowExport(true)}
                      className="rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
                      style={{
                        border: '1px solid var(--accent-primary)',
                        color: 'var(--accent-subtle)',
                      }}>
                      Export
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={handleExtract}
                  disabled={loading}
                  className="rounded-lg px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                  style={{ background: 'var(--accent-gradient)' }}>
                  {loading ? 'Extracting...' : 'Extract'}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Brandings list view */}
      {isBrandingsView && (
        <div className="flex-1 overflow-y-auto">
          <BrandingsView
            brandings={brandings}
            onSelect={handleSelectBranding}
            onDeleted={handleBrandingDeleted}
            onSaveCurrent={result ? handleSaveCurrent : undefined}
            hasCurrentResult={result !== null}
          />
        </div>
      )}

      {/* Branding detail view */}
      {isDetailView && view.type === 'detail' && (
        <BrandingDetailView branding={view.branding} onBack={handleBackFromDetail} onCopy={handleCopy} />
      )}

      {/* Main extraction view */}
      {isExtractView && (
        <>
          {/* Tabs */}
          <div className="flex" style={{ borderBottom: '1px solid var(--border-default)' }}>
            {tabs.map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className="flex-1 py-2 text-xs font-medium transition-colors"
                style={
                  activeTab === tab.id
                    ? {
                        borderBottom: '2px solid var(--accent-primary)',
                        color: 'var(--accent-subtle)',
                      }
                    : {
                        color: 'var(--text-secondary)',
                      }
                }>
                {tab.label}
                {tab.count !== undefined && tab.count > 0 && (
                  <span className="ml-1 text-[10px]" style={{ color: 'var(--text-muted)' }}>
                    ({tab.count})
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4">
            {loading ? (
              <SkeletonLoader />
            ) : !result ? (
              <div className="flex h-full items-center justify-center text-sm" style={{ color: 'var(--text-muted)' }}>
                Click &ldquo;Extract&rdquo; to analyze this page&apos;s design system
              </div>
            ) : (
              <>
                {activeTab === 'colors' && <ColorSwatches colors={result.colors} onCopy={handleCopy} />}
                {activeTab === 'typography' && <TypographyList typography={result.typography} onCopy={handleCopy} />}
                {activeTab === 'spacing' && <SpacingGrid spacing={result.spacing} onCopy={handleCopy} />}
                {activeTab === 'components' && <ComponentList components={result.components} onCopy={handleCopy} />}
                {activeTab === 'animations' && <AnimationList animations={result.animations} onCopy={handleCopy} />}
              </>
            )}
          </div>
        </>
      )}

      {/* Copy toast */}
      {copied && (
        <div
          className="absolute bottom-20 left-1/2 -translate-x-1/2 rounded-full px-4 py-1.5 text-xs text-white shadow-lg"
          style={{ backgroundColor: '#1e293b', border: '1px solid var(--border-default)' }}>
          Copied!
        </div>
      )}

      {/* Saved toast */}
      {savedToast && (
        <div
          className="absolute bottom-20 left-1/2 -translate-x-1/2 rounded-full px-4 py-1.5 text-xs text-white shadow-lg"
          style={{ backgroundColor: 'var(--accent-primary)' }}>
          Saved!
        </div>
      )}

      {/* Export modal */}
      {showExport && result && <ExportModal result={result} onClose={() => setShowExport(false)} />}

      {/* Footer */}
      <a
        href="https://studionope.nl"
        target="_blank"
        rel="noopener noreferrer"
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          padding: '12px 20px',
          background: 'var(--brand-footer-bg)',
          color: 'var(--brand-footer-text)',
          textAlign: 'center',
          fontSize: '18px',
          fontWeight: 600,
          fontFamily: "'Instrument Serif', serif",
          textDecoration: 'none',
          zIndex: 50,
        }}>
        Built by <strong>Studio N.O.P.E.</strong>
      </a>
    </div>
  );
};

export default SidePanel;
