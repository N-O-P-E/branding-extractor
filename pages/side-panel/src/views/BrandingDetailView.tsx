import { AnimationList } from '../components/AnimationList';
import { ColorSwatches } from '../components/ColorSwatches';
import { ComponentList } from '../components/ComponentList';
import { ExportModal } from '../components/ExportModal';
import { SpacingGrid } from '../components/SpacingGrid';
import { TypographyList } from '../components/TypographyList';
import { useCallback, useState } from 'react';
import type { SavedBranding } from '@extension/storage';

interface Props {
  branding: SavedBranding;
  onBack: () => void;
  onCopy: (value: string) => void;
}

type Tab = 'colors' | 'typography' | 'spacing' | 'components' | 'animations';

const formatDate = (timestamp: number): string => {
  const date = new Date(timestamp);
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

export const BrandingDetailView = ({ branding, onBack, onCopy }: Props) => {
  const [activeTab, setActiveTab] = useState<Tab>('colors');
  const [showExport, setShowExport] = useState(false);

  const handleExportClose = useCallback(() => setShowExport(false), []);
  const handleExportOpen = useCallback(() => setShowExport(true), []);

  const { data } = branding;

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'colors', label: 'Colors', count: data.colors.length },
    { id: 'typography', label: 'Type', count: data.typography.length },
    { id: 'spacing', label: 'Spacing', count: data.spacing.length },
    { id: 'components', label: 'Components', count: data.components.length },
    { id: 'animations', label: 'Animations', count: data.animations.length },
  ];

  return (
    <>
      {/* Detail header */}
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to saved brandings"
          className="rounded p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path
              d="M10 12L6 8l4-4"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>

        {branding.favicon && <img src={branding.favicon} alt="" className="h-4 w-4 shrink-0" aria-hidden="true" />}

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-gray-800">{branding.name}</p>
          <p className="truncate text-[10px] text-gray-400">
            {branding.url} &middot; {formatDate(branding.savedAt)}
          </p>
        </div>

        <button
          type="button"
          onClick={handleExportOpen}
          className="shrink-0 rounded-lg border border-indigo-200 px-3 py-1.5 text-xs font-medium text-indigo-600 transition-colors hover:bg-indigo-50">
          Export
        </button>
      </div>

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

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === 'colors' && <ColorSwatches colors={data.colors} onCopy={onCopy} />}
        {activeTab === 'typography' && <TypographyList typography={data.typography} onCopy={onCopy} />}
        {activeTab === 'spacing' && <SpacingGrid spacing={data.spacing} onCopy={onCopy} />}
        {activeTab === 'components' && <ComponentList components={data.components} onCopy={onCopy} />}
        {activeTab === 'animations' && <AnimationList animations={data.animations} onCopy={onCopy} />}
      </div>

      {showExport && <ExportModal result={data} onClose={handleExportClose} />}
    </>
  );
};
