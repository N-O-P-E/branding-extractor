import { AnimationList } from './components/AnimationList';
import { ColorEditor } from './components/ColorEditor';
import { ComponentList } from './components/ComponentList';
import { ExportModal } from './components/ExportModal';
import { OverrideToggle } from './components/OverrideToggle';
import { SkeletonLoader } from './components/SkeletonLoader';
import { SpacingEditor } from './components/SpacingEditor';
import { ThemeSettings } from './components/ThemeSettings';
import { TypographyEditor } from './components/TypographyEditor';
import { useOverrides } from './hooks/useOverrides';
import { useTheme } from './hooks/useTheme';
import { BrandingDetailView } from './views/BrandingDetailView';
import { BrandingsView } from './views/BrandingsView';
import { ElementDetailView } from './views/ElementDetailView';
import { getBrandings, saveBranding } from '@extension/storage';
import { useCallback, useEffect, useState } from 'react';
import type { ExtractionResult } from '@extension/extractor';
import type { SavedBranding } from '@extension/storage';
import type { ReactNode } from 'react';

type Tab = 'colors' | 'typography' | 'spacing' | 'components' | 'animations';

type View =
  | { type: 'extract' }
  | { type: 'brandings' }
  | { type: 'settings' }
  | { type: 'detail'; branding: SavedBranding }
  | { type: 'element'; selector: string; styles: Record<string, string>; linkedTokens: Record<string, string> };

// Tab icon components (inline SVG, 14×14)
const ColorIcon = () => (
  <svg width="14" height="14" viewBox="0 0 12 12" fill="none" aria-hidden="true">
    <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.25" />
    <circle cx="6" cy="6" r="2" fill="currentColor" />
  </svg>
);

const TypeIcon = () => (
  <svg width="14" height="14" viewBox="0 0 12 12" fill="none" aria-hidden="true">
    <path d="M2 3h8M6 3v6" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
  </svg>
);

const SpacingIcon = () => (
  <svg width="14" height="14" viewBox="0 0 12 12" fill="none" aria-hidden="true">
    <path
      d="M1 6h10M4 3l-3 3 3 3M8 3l3 3-3 3"
      stroke="currentColor"
      strokeWidth="1.25"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const ComponentIcon = () => (
  <svg width="14" height="14" viewBox="0 0 12 12" fill="none" aria-hidden="true">
    <rect x="1.5" y="1.5" width="4" height="4" rx="0.75" stroke="currentColor" strokeWidth="1.25" />
    <rect x="6.5" y="1.5" width="4" height="4" rx="0.75" stroke="currentColor" strokeWidth="1.25" />
    <rect x="1.5" y="6.5" width="4" height="4" rx="0.75" stroke="currentColor" strokeWidth="1.25" />
    <rect x="6.5" y="6.5" width="4" height="4" rx="0.75" stroke="currentColor" strokeWidth="1.25" />
  </svg>
);

const AnimIcon = () => (
  <svg width="14" height="14" viewBox="0 0 12 12" fill="none" aria-hidden="true">
    <path d="M2 6c0-2.2 1.8-4 4-4s4 1.8 4 4" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    <path
      d="M10 6c0 2.2-1.8 4-4 4S2 8.2 2 6"
      stroke="currentColor"
      strokeWidth="1.25"
      strokeLinecap="round"
      strokeDasharray="2 1.5"
    />
  </svg>
);

const CrosshairIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
    <circle cx="7" cy="7" r="3" stroke="currentColor" strokeWidth="1.25" />
    <line x1="7" y1="1" x2="7" y2="3.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    <line x1="7" y1="10.5" x2="7" y2="13" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    <line x1="1" y1="7" x2="3.5" y2="7" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    <line x1="10.5" y1="7" x2="13" y2="7" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
  </svg>
);

const SaveIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path
      d="M12.5 14H3.5C3.10218 14 2.72064 13.842 2.43934 13.5607C2.15804 13.2794 2 12.8978 2 12.5V3.5C2 3.10218 2.15804 2.72064 2.43934 2.43934C2.72064 2.15804 3.10218 2 3.5 2H10.5L14 5.5V12.5C14 12.8978 13.842 13.2794 13.5607 13.5607C13.2794 13.842 12.8978 14 12.5 14Z"
      stroke="currentColor"
      strokeWidth="1.25"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path d="M11.5 14V9H4.5V14" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M4.5 2V5.5H10" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const ExportIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path
      d="M14 10V12.5C14 13.3284 13.3284 14 12.5 14H3.5C2.67157 14 2 13.3284 2 12.5V10"
      stroke="currentColor"
      strokeWidth="1.25"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M5 6.5L8 3.5L11 6.5"
      stroke="currentColor"
      strokeWidth="1.25"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path d="M8 3.5V10.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const SettingsIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.25" />
    <path
      d="M13.1 10.1a1.1 1.1 0 0 0 .22 1.21l.04.04a1.33 1.33 0 1 1-1.89 1.89l-.04-.04a1.1 1.1 0 0 0-1.21-.22 1.1 1.1 0 0 0-.67 1.01v.11a1.33 1.33 0 1 1-2.67 0v-.06A1.1 1.1 0 0 0 6.17 12.9a1.1 1.1 0 0 0-1.21.22l-.04.04a1.33 1.33 0 1 1-1.89-1.89l.04-.04a1.1 1.1 0 0 0 .22-1.21 1.1 1.1 0 0 0-1.01-.67h-.11a1.33 1.33 0 1 1 0-2.67h.06A1.1 1.1 0 0 0 3.27 6.17a1.1 1.1 0 0 0-.22-1.21l-.04-.04a1.33 1.33 0 1 1 1.89-1.89l.04.04a1.1 1.1 0 0 0 1.21.22h.05a1.1 1.1 0 0 0 .67-1.01v-.11a1.33 1.33 0 1 1 2.67 0v.06a1.1 1.1 0 0 0 .67 1.01 1.1 1.1 0 0 0 1.21-.22l.04-.04a1.33 1.33 0 1 1 1.89 1.89l-.04.04a1.1 1.1 0 0 0-.22 1.21v.05a1.1 1.1 0 0 0 1.01.67h.11a1.33 1.33 0 0 1 0 2.67h-.06a1.1 1.1 0 0 0-1.01.67Z"
      stroke="currentColor"
      strokeWidth="1"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const ResetIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M2 2v5h5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
    <path
      d="M3.05 10A6 6 0 1 0 4.18 4.18L2 7"
      stroke="currentColor"
      strokeWidth="1.25"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/** Reusable card button for the action bar grid */
const ActionCard = ({
  icon,
  label,
  onClick,
  active,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
}) => (
  <button
    type="button"
    onClick={onClick}
    className="flex cursor-pointer items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-xs font-medium transition-all"
    style={{
      border: active ? '1px solid var(--accent-primary)' : '1px solid var(--border-default)',
      background: active ? 'var(--accent-10)' : 'var(--bg-input)',
      color: active ? 'var(--accent-subtle)' : 'var(--text-secondary)',
    }}
    onMouseEnter={e => {
      if (!active) {
        (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--accent-primary)';
        (e.currentTarget as HTMLButtonElement).style.color = 'var(--accent-subtle)';
        (e.currentTarget as HTMLButtonElement).style.background = 'var(--accent-10)';
      }
    }}
    onMouseLeave={e => {
      if (!active) {
        (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-default)';
        (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)';
        (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-input)';
      }
    }}>
    {icon}
    {label}
  </button>
);

const SidePanel = () => {
  const [view, setView] = useState<View>({ type: 'extract' });
  const [activeTab, setActiveTab] = useState<Tab>('colors');
  const [result, setResult] = useState<ExtractionResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [brandings, setBrandings] = useState<SavedBranding[]>([]);
  const [savedToast, setSavedToast] = useState(false);

  const { overrides, overridesList, hasOverrides, enabled, applyOverride, removeOverride, clearAll, toggleEnabled } =
    useOverrides();

  const { activeTheme, allThemes, changeTheme, tryActivateCode } = useTheme();

  useEffect(() => {
    getBrandings()
      .then(setBrandings)
      .catch((err: unknown) => console.error('Failed to load brandings:', err));
  }, []);

  // Listen for element selection from the content-ui inspector
  useEffect(() => {
    const handler = (message: { type: string; payload?: unknown }) => {
      if (message.type === 'ELEMENT_SELECTED' && message.payload) {
        const { selector, computedStyles, linkedTokens } = message.payload as {
          selector: string;
          computedStyles: Record<string, string>;
          linkedTokens: Record<string, string>;
        };
        setView({ type: 'element', selector, styles: computedStyles, linkedTokens });
      }
    };
    chrome.runtime.onMessage.addListener(handler);
    return () => chrome.runtime.onMessage.removeListener(handler);
  }, []);

  const handleActivateInspector = useCallback(async () => {
    setError(null);
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id || !tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
        setError('Cannot inspect this page. Navigate to a website first.');
        return;
      }
      await chrome.tabs.sendMessage(tab.id, { type: 'ACTIVATE_INSPECTOR' });
    } catch (err) {
      console.error('Inspector activation failed:', err);
      setError('Could not connect to this page. Try refreshing the page.');
    }
  }, []);

  const handleExtract = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id || !tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
        setError('Cannot extract from this page. Navigate to a website first.');
        return;
      }
      const response = await chrome.tabs.sendMessage(tab.id, { type: 'EXTRACT_STYLES' });
      if (response?.result) {
        setResult(response.result);
        setView({ type: 'extract' });
      } else {
        setError('Extraction returned no results.');
      }
    } catch (err) {
      console.error('Extraction failed:', err);
      setError('Could not connect to this page. Try refreshing the page.');
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
      const url = new URL(result.url);
      const hostname = url.hostname;
      const favicon = `https://www.google.com/s2/favicons?domain=${hostname}`;
      const newBranding: SavedBranding = {
        id: crypto.randomUUID(),
        name: hostname,
        url: result.url,
        origin: url.origin,
        favicon,
        data: result,
        overrides: [],
        enabled: false,
        savedAt: Date.now(),
        updatedAt: Date.now(),
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

  const handleBrandingImported = useCallback((branding: SavedBranding) => {
    setBrandings(prev => [...prev, branding]);
  }, []);

  const handleSelectBranding = useCallback((branding: SavedBranding) => {
    setView({ type: 'detail', branding });
  }, []);

  const handleBackFromDetail = useCallback(() => {
    setView({ type: 'brandings' });
  }, []);

  const tabs: { id: Tab; label: string; icon: ReactNode; count?: number }[] = [
    { id: 'colors', label: 'Color', icon: <ColorIcon />, count: result?.colors.length },
    { id: 'typography', label: 'Type', icon: <TypeIcon />, count: result?.typography.length },
    { id: 'spacing', label: 'Space', icon: <SpacingIcon />, count: result?.spacing.length },
    { id: 'components', label: 'Comps', icon: <ComponentIcon />, count: result?.components.length },
    { id: 'animations', label: 'Anim', icon: <AnimIcon />, count: result?.animations.length },
  ];

  const isExtractView = view.type === 'extract';
  const isBrandingsView = view.type === 'brandings';
  const isSettingsView = view.type === 'settings';
  const isDetailView = view.type === 'detail';
  const isElementView = view.type === 'element';

  return (
    <div
      className="relative flex h-screen flex-col pb-14"
      style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
      {/* Header — hidden when viewing detail or element (they have their own headers) */}
      {!isDetailView && !isElementView && !isSettingsView && (
        <div className="flex flex-col" style={{ borderBottom: '1px solid var(--border-default)' }}>
          {/* Row 1: Title + primary actions */}
          <div className="flex items-center justify-between gap-2 px-4 pb-2 pt-3">
            <div className="flex items-center gap-1.5">
              {isBrandingsView && (
                <button
                  type="button"
                  onClick={() => setView({ type: 'extract' })}
                  aria-label="Back to extraction"
                  className="flex cursor-pointer items-center justify-center rounded-md p-1 transition-colors"
                  style={{ color: 'var(--text-secondary)' }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLButtonElement).style.color = 'var(--accent-subtle)';
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)';
                  }}>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path
                      d="M10 3L5 8l5 5"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              )}
              <h1
                className="shrink-0 text-lg leading-tight"
                style={{
                  fontFamily: "'Instrument Serif', serif",
                  fontWeight: 400,
                  fontStyle: 'italic',
                  color: 'var(--text-primary)',
                }}>
                Branding Extractor
              </h1>
            </div>

            <div className="flex items-center gap-1.5">
              {/* Saved brandings button — only shown in extract view */}
              {isExtractView && (
                <button
                  type="button"
                  onClick={() => setView({ type: 'brandings' })}
                  aria-label="View saved brandings"
                  className="cursor-pointer rounded-lg px-2.5 py-1 text-xs font-medium transition-colors"
                  style={{
                    border: '1px solid var(--border-default)',
                    color: 'var(--text-secondary)',
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--accent-primary)';
                    (e.currentTarget as HTMLButtonElement).style.color = 'var(--accent-subtle)';
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-default)';
                    (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)';
                  }}>
                  {`Saved${brandings.length > 0 ? ` (${brandings.length})` : ''}`}
                </button>
              )}

              <button
                type="button"
                onClick={handleExtract}
                disabled={loading}
                className="cursor-pointer rounded-lg px-2.5 py-1 text-xs font-medium text-white transition-opacity disabled:opacity-50"
                style={{ background: 'var(--accent-gradient)' }}>
                {loading ? 'Extracting…' : 'Extract'}
              </button>
            </div>
          </div>

          {/* Action bar */}
          {isExtractView && (
            <div className="px-3 pb-2 pt-1">
              {/* Override toggle — shown above grid when there are overrides */}
              {result && hasOverrides && (
                <div className="mb-2">
                  <OverrideToggle enabled={enabled} onToggle={toggleEnabled} hasOverrides={hasOverrides} />
                </div>
              )}

              {/* Action card grid */}
              <div className="grid grid-cols-2 gap-2">
                {result && (
                  <>
                    <ActionCard icon={<SaveIcon />} label="Save" onClick={handleSaveCurrent} />
                    <ActionCard icon={<ExportIcon />} label="Export" onClick={() => setShowExport(true)} />
                  </>
                )}
                <ActionCard icon={<CrosshairIcon />} label="Inspect" onClick={handleActivateInspector} />
                <ActionCard icon={<ResetIcon />} label="Reset" onClick={() => clearAll()} />
                <ActionCard icon={<SettingsIcon />} label="Settings" onClick={() => setView({ type: 'settings' })} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Brandings list view */}
      {isBrandingsView && (
        <div className="flex-1 overflow-y-auto">
          <BrandingsView
            brandings={brandings}
            onSelect={handleSelectBranding}
            onDeleted={handleBrandingDeleted}
            onImported={handleBrandingImported}
            onSaveCurrent={result ? handleSaveCurrent : undefined}
            hasCurrentResult={result !== null}
          />
        </div>
      )}

      {/* Settings view */}
      {isSettingsView && (
        <div className="flex flex-1 flex-col overflow-hidden">
          <div
            className="flex items-center gap-1.5 px-4 pb-2 pt-3"
            style={{ borderBottom: '1px solid var(--border-default)' }}>
            <button
              type="button"
              onClick={() => setView({ type: 'extract' })}
              aria-label="Back"
              className="flex cursor-pointer items-center justify-center rounded-md p-1 transition-colors"
              style={{ color: 'var(--text-secondary)' }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.color = 'var(--accent-subtle)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)';
              }}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path
                  d="M10 3L5 8l5 5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            <h1
              className="text-base font-semibold"
              style={{ fontFamily: 'var(--font-heading)', color: 'var(--text-primary)' }}>
              Settings
            </h1>
          </div>
          <div className="flex-1 overflow-y-auto">
            <ThemeSettings
              activeTheme={activeTheme}
              allThemes={allThemes}
              onChangeTheme={changeTheme}
              onActivateCode={tryActivateCode}
            />
          </div>
        </div>
      )}

      {/* Branding detail view */}
      {isDetailView && view.type === 'detail' && (
        <BrandingDetailView branding={view.branding} onBack={handleBackFromDetail} onCopy={handleCopy} />
      )}

      {/* Element inspector detail view */}
      {isElementView && view.type === 'element' && (
        <ElementDetailView
          selector={view.selector}
          computedStyles={view.styles}
          linkedTokens={view.linkedTokens}
          overrides={overrides}
          onOverride={applyOverride}
          onResetOverride={removeOverride}
          onBack={() => setView({ type: 'extract' })}
        />
      )}

      {/* Main extraction view */}
      {isExtractView && (
        <>
          {/* Tab pills */}
          <div className="px-3 pb-2">
            <p
              className="mb-1.5 text-[10px] font-medium uppercase tracking-wider"
              style={{ color: 'var(--text-muted)' }}>
              Design Tokens
            </p>
            <div className="flex flex-wrap gap-1.5">
              {tabs.map(tab => {
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className="flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all"
                    style={
                      isActive
                        ? {
                            border: '1px solid var(--accent-primary)',
                            background: 'var(--accent-10)',
                            color: 'var(--accent-subtle)',
                          }
                        : {
                            border: '1px solid var(--border-default)',
                            background: 'transparent',
                            color: 'var(--text-secondary)',
                          }
                    }
                    title={tab.label}>
                    {tab.label}
                    {tab.count !== undefined && tab.count > 0 && (
                      <span
                        className="font-mono text-[10px] leading-none"
                        style={{ color: isActive ? 'var(--accent-subtle)' : 'var(--text-muted)' }}>
                        {tab.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Content area */}
          <div className="flex-1 overflow-y-auto p-4">
            {loading ? (
              <SkeletonLoader />
            ) : error ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
                <p className="text-sm leading-relaxed" style={{ color: 'var(--status-error)' }}>
                  {error}
                </p>
                <button
                  type="button"
                  onClick={() => setError(null)}
                  className="cursor-pointer text-xs underline transition-opacity hover:opacity-70"
                  style={{ color: 'var(--text-muted)' }}>
                  Dismiss
                </button>
              </div>
            ) : !result ? (
              <div className="flex h-full items-center justify-center text-sm" style={{ color: 'var(--text-muted)' }}>
                Click &ldquo;Extract&rdquo; to analyze this page&apos;s design system
              </div>
            ) : (
              <>
                {activeTab === 'colors' && (
                  <ColorEditor
                    colors={result.colors}
                    overrides={overrides}
                    onOverride={applyOverride}
                    onResetOverride={removeOverride}
                    onCopy={handleCopy}
                  />
                )}
                {activeTab === 'typography' && (
                  <TypographyEditor
                    typography={result.typography}
                    overrides={overrides}
                    onOverride={applyOverride}
                    onResetOverride={removeOverride}
                    onCopy={handleCopy}
                  />
                )}
                {activeTab === 'spacing' && (
                  <SpacingEditor
                    spacing={result.spacing}
                    overrides={overrides}
                    onOverride={applyOverride}
                    onResetOverride={removeOverride}
                    onCopy={handleCopy}
                  />
                )}
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
      {showExport && result && (
        <ExportModal result={result} onClose={() => setShowExport(false)} overrides={overridesList} />
      )}

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
        {activeTheme !== 'default' ? (
          <>
            Studio N.O.P.E. &times; <strong>{allThemes.find(t => t.id === activeTheme)?.label}</strong>
          </>
        ) : (
          <>
            Built by <strong>Studio N.O.P.E.</strong>
          </>
        )}
      </a>
    </div>
  );
};

export default SidePanel;
