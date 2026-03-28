import { AnimationList } from './components/AnimationList';
import { ColorSwatches } from './components/ColorSwatches';
import { ComponentList } from './components/ComponentList';
import { SkeletonLoader } from './components/SkeletonLoader';
import { SpacingGrid } from './components/SpacingGrid';
import { TypographyList } from './components/TypographyList';
import { useCallback, useState } from 'react';
import type { ExtractionResult } from '@extension/extractor';

type Tab = 'colors' | 'typography' | 'spacing' | 'components' | 'animations';

const SidePanel = () => {
  const [activeTab, setActiveTab] = useState<Tab>('colors');
  const [result, setResult] = useState<ExtractionResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleExtract = useCallback(async () => {
    setLoading(true);
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        const response = await chrome.tabs.sendMessage(tab.id, { type: 'EXTRACT_STYLES' });
        setResult(response.result);
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

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'colors', label: 'Colors', count: result?.colors.length },
    { id: 'typography', label: 'Type', count: result?.typography.length },
    { id: 'spacing', label: 'Spacing', count: result?.spacing.length },
    { id: 'components', label: 'Components', count: result?.components.length },
    { id: 'animations', label: 'Animations', count: result?.animations.length },
  ];

  return (
    <div className="flex h-screen flex-col bg-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h1 className="text-lg font-semibold">Branding Extractor</h1>
        <button
          onClick={handleExtract}
          disabled={loading}
          className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
          {loading ? 'Extracting...' : 'Extract'}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b">
        {tabs.map(tab => (
          <button
            key={tab.id}
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

      {/* Copy toast */}
      {copied && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-gray-900 px-4 py-1.5 text-xs text-white shadow-lg">
          Copied!
        </div>
      )}
    </div>
  );
};

export default SidePanel;
