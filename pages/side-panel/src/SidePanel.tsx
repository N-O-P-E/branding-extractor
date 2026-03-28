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
    <div className="relative flex h-screen flex-col bg-white">
      {/* Header — hidden when viewing detail (detail has its own header) */}
      {!isDetailView && (
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h1 className="text-lg font-semibold">Branding Extractor</h1>
          <div className="flex items-center gap-2">
            {/* Saved brandings toggle */}
            <button
              type="button"
              onClick={() => setView(isBrandingsView ? { type: 'extract' } : { type: 'brandings' })}
              aria-label={isBrandingsView ? 'Back to extraction' : 'View saved brandings'}
              className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                isBrandingsView
                  ? 'border-indigo-200 bg-indigo-50 text-indigo-600'
                  : 'border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-700'
              }`}>
              {isBrandingsView ? 'Extract' : `Saved${brandings.length > 0 ? ` (${brandings.length})` : ''}`}
            </button>

            {isExtractView && (
              <>
                {result && (
                  <>
                    <button
                      type="button"
                      onClick={handleSaveCurrent}
                      className="rounded-lg border border-indigo-200 px-3 py-1.5 text-sm font-medium text-indigo-600 transition-colors hover:bg-indigo-50">
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowExport(true)}
                      className="rounded-lg border border-indigo-200 px-3 py-1.5 text-sm font-medium text-indigo-600 transition-colors hover:bg-indigo-50">
                      Export
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={handleExtract}
                  disabled={loading}
                  className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
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
          <div className="flex border-b">
            {tabs.map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 py-2 text-xs font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'border-b-2 border-indigo-600 text-indigo-600'
                    : 'text-gray-500 hover:text-gray-700'
                }`}>
                {tab.label}
                {tab.count !== undefined && tab.count > 0 && (
                  <span className="ml-1 text-[10px] text-gray-400">({tab.count})</span>
                )}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4">
            {loading ? (
              <SkeletonLoader />
            ) : !result ? (
              <div className="flex h-full items-center justify-center text-sm text-gray-400">
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
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-gray-900 px-4 py-1.5 text-xs text-white shadow-lg">
          Copied!
        </div>
      )}

      {/* Saved toast */}
      {savedToast && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-indigo-600 px-4 py-1.5 text-xs text-white shadow-lg">
          Saved!
        </div>
      )}

      {/* Export modal */}
      {showExport && result && <ExportModal result={result} onClose={() => setShowExport(false)} />}
    </div>
  );
};

export default SidePanel;
