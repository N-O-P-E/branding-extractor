import IssueCard from '../components/IssueCard';
import RepoSelector from '../components/RepoSelector';
import ToolButton from '../components/ToolButton';
import { useState, useEffect, useCallback } from 'react';
import type { PageIssue } from '@extension/shared';

interface HomeViewProps {
  onOpenSettings: () => void;
}

const colors = {
  textPrimary: '#f1f5f9',
  textSecondary: 'rgba(241,245,249,0.45)',
  textMuted: 'rgba(241,245,249,0.3)',
  purpleAccent: '#a78bfa',
  purple500: '#8b5cf6',
  border: 'rgba(148,163,184,0.15)',
  divider: 'rgba(148,163,184,0.1)',
  green: '#4ade80',
} as const;

export default function HomeView({ onOpenSettings }: HomeViewProps) {
  const [repos, setRepos] = useState<string[]>([]);
  const [selectedRepo, setSelectedRepo] = useState('');
  const [activeTool, setActiveTool] = useState<'select' | 'pencil' | 'inspect' | null>(null);
  const [issues, setIssues] = useState<PageIssue[]>([]);
  const [loading, setLoading] = useState(false);
  const [patConnected, setPatConnected] = useState(false);

  // Load settings from storage
  useEffect(() => {
    chrome.storage.sync.get(['repoList', 'selectedRepo', 'githubPat']).then(result => {
      if (result.repoList) setRepos(result.repoList as string[]);
      if (result.selectedRepo) setSelectedRepo(result.selectedRepo as string);
      setPatConnected(!!result.githubPat);
    });
  }, []);

  // Listen for tool switch messages from content-UI
  useEffect(() => {
    const listener = (message: { type: string; payload?: { tool: string } }) => {
      if (message.type === 'TOOL_SWITCHED') {
        const tool = message.payload?.tool;
        setActiveTool(tool ? (tool as 'select' | 'pencil' | 'inspect') : null);
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  // Fetch issues when repo changes or on mount
  const fetchIssues = useCallback(async () => {
    if (!selectedRepo) return;
    setLoading(true);
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.url) {
        const response = await chrome.runtime.sendMessage({
          type: 'FETCH_PAGE_ISSUES',
          payload: { pageUrl: tab.url },
        });
        if (response?.success && response.issues) {
          setIssues(response.issues as PageIssue[]);
        }
      }
    } catch {
      // Silently fail — issues section will show empty
    } finally {
      setLoading(false);
    }
  }, [selectedRepo]);

  useEffect(() => {
    void fetchIssues();
  }, [fetchIssues]);

  // Re-fetch issues when the active tab URL changes
  useEffect(() => {
    const listener = (_tabId: number, changeInfo: chrome.tabs.TabChangeInfo) => {
      if (changeInfo.url || changeInfo.status === 'complete') {
        void fetchIssues();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
    return () => chrome.tabs.onUpdated.removeListener(listener);
  }, [fetchIssues]);

  const handleRepoChange = (repo: string) => {
    setSelectedRepo(repo);
    chrome.storage.sync.set({ selectedRepo: repo });
  };

  const handleToolClick = (tool: 'select' | 'pencil' | 'inspect') => {
    setActiveTool(tool);
    chrome.runtime.sendMessage(
      { type: 'ACTIVATE_TOOL', payload: { tool } },
      (response: { success: boolean; error?: string }) => {
        if (response && !response.success) {
          console.error('ACTIVATE_TOOL failed:', response.error);
        }
      },
    );
  };

  const sectionHeadingStyle: React.CSSProperties = {
    fontSize: 18,
    margin: 0,
    color: colors.purpleAccent,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  };

  const settingsRowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 0',
    cursor: 'pointer',
    background: 'none',
    border: 'none',
    borderBottomStyle: 'solid',
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
    width: '100%',
    color: colors.textPrimary,
    fontSize: 14,
    textAlign: 'left',
    transition: 'all 0.15s',
  };

  return (
    <div
      style={{
        flex: 1,
        background: '#0f172a',
        color: colors.textPrimary,
        boxSizing: 'border-box',
      }}>
      {/* Header */}
      <div
        style={{ padding: '28px 20px 0', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h1
            style={{
              fontSize: 26,
              margin: 0,
              color: colors.textPrimary,
              lineHeight: 1.2,
            }}>
            Co-worker
          </h1>
          <p style={{ margin: '6px 0 0', color: colors.textSecondary, fontSize: 13 }}>
            Visual GitHub issue reporting tool.
          </p>
        </div>
        <button
          onClick={onOpenSettings}
          title="Settings"
          style={{
            background: 'rgba(148,163,184,0.08)',
            border: '1px solid rgba(148,163,184,0.12)',
            borderRadius: 8,
            width: 32,
            height: 32,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: 'rgba(241,245,249,0.5)',
            padding: 0,
            flexShrink: 0,
            transition: 'all 0.15s',
            marginTop: 4,
          }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M7.878 5.21415L7.17474 5.05186C6.58003 4.91462 5.95657 5.09343 5.525 5.525C5.09343 5.95657 4.91462 6.58003 5.05186 7.17474L5.21415 7.878C5.40122 8.6886 5.06696 9.53036 4.37477 9.99182L3.51965 10.5619C3.03881 10.8825 2.75 11.4221 2.75 12C2.75 12.5779 3.03881 13.1175 3.51965 13.4381L4.37477 14.0082C5.06696 14.4696 5.40122 15.3114 5.21415 16.122L5.05186 16.8253C4.91462 17.42 5.09343 18.0434 5.525 18.475C5.95657 18.9066 6.58003 19.0854 7.17474 18.9481L7.878 18.7858C8.6886 18.5988 9.53036 18.933 9.99182 19.6252L10.5619 20.4804C10.8825 20.9612 11.4221 21.25 12 21.25C12.5779 21.25 13.1175 20.9612 13.4381 20.4804L14.0082 19.6252C14.4696 18.933 15.3114 18.5988 16.122 18.7858L16.8253 18.9481C17.42 19.0854 18.0434 18.9066 18.475 18.475C18.9066 18.0434 19.0854 17.42 18.9481 16.8253L18.7858 16.122C18.5988 15.3114 18.933 14.4696 19.6252 14.0082L20.4804 13.4381C20.9612 13.1175 21.25 12.5779 21.25 12C21.25 11.4221 20.9612 10.8825 20.4804 10.5619L19.6252 9.99182C18.933 9.53036 18.5988 8.6886 18.7858 7.878L18.9481 7.17473C19.0854 6.58003 18.9066 5.95657 18.475 5.525C18.0434 5.09343 17.42 4.91462 16.8253 5.05186L16.122 5.21415C15.3114 5.40122 14.4696 5.06696 14.0082 4.37477L13.4381 3.51965C13.1175 3.03881 12.5779 2.75 12 2.75C11.4221 2.75 10.8825 3.03881 10.5619 3.51965L9.99182 4.37477C9.53036 5.06696 8.6886 5.40122 7.878 5.21415Z"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
            <path
              d="M14.75 12C14.75 13.5188 13.5188 14.75 12 14.75C10.4812 14.75 9.25 13.5188 9.25 12C9.25 10.4812 10.4812 9.25 12 9.25C13.5188 9.25 14.75 10.4812 14.75 12Z"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      {/* Repository section */}
      <div style={{ padding: '20px 20px 0' }}>
        <RepoSelector selectedRepo={selectedRepo} repos={repos} onChange={handleRepoChange} />
      </div>

      {/* Divider */}
      <div style={{ margin: '20px 20px 0', borderTop: `1px solid ${colors.divider}` }} />

      {/* Report section */}
      <div style={{ padding: '16px 20px 0' }}>
        <h2 style={sectionHeadingStyle}>Report</h2>
        <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
          <ToolButton
            icon="select"
            label="Select"
            active={activeTool === 'select'}
            disabled={activeTool !== null && activeTool !== 'select'}
            onClick={() => handleToolClick('select')}
          />
          <ToolButton
            icon="pencil"
            label="Canvas"
            active={activeTool === 'pencil'}
            onClick={() => handleToolClick('pencil')}
          />
          <ToolButton
            icon="inspect"
            label="Inspect"
            active={activeTool === 'inspect'}
            disabled={activeTool !== null && activeTool !== 'inspect'}
            onClick={() => handleToolClick('inspect')}
          />
        </div>
      </div>

      {/* Divider */}
      <div style={{ margin: '20px 20px 0', borderTop: `1px solid ${colors.divider}` }} />

      {/* Page Issues section */}
      <div style={{ padding: '16px 20px 0' }}>
        <h2 style={sectionHeadingStyle}>
          Page Issues
          <span
            style={{
              fontSize: 12,
              fontWeight: 500,
              background: 'rgba(139,92,246,0.2)',
              color: '#c4b5fd',
              padding: '2px 8px',
              borderRadius: 10,
              lineHeight: 1.4,
            }}>
            {issues.length}
          </span>
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
          {loading && <p style={{ fontSize: 13, color: colors.textSecondary, margin: 0 }}>Loading...</p>}
          {!loading && issues.length === 0 && (
            <p style={{ fontSize: 13, color: colors.textSecondary, margin: 0 }}>No issues found for this page.</p>
          )}
          {!loading && issues.map(issue => <IssueCard key={issue.number} issue={issue} />)}
        </div>
      </div>

      {/* Divider */}
      <div style={{ margin: '20px 20px 0', borderTop: `1px solid ${colors.divider}` }} />

      {/* Settings section */}
      <div style={{ padding: '16px 20px 24px' }}>
        {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions */}
        <h2 style={{ ...sectionHeadingStyle, cursor: 'pointer' }} onClick={onOpenSettings}>
          Settings
        </h2>
        <div style={{ marginTop: 8 }}>
          <button onClick={onOpenSettings} style={settingsRowStyle}>
            <span>GitHub Token</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 12, color: patConnected ? colors.green : colors.textSecondary }}>
                {patConnected ? 'Connected' : 'Not connected'}
              </span>
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                style={{ transform: 'rotate(-90deg)', opacity: 0.3 }}>
                <path
                  d="M5.75 9.5L12 15.75L18.25 9.5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
          </button>
          <button onClick={onOpenSettings} style={settingsRowStyle}>
            <span>Repositories</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 12, color: colors.textSecondary }}>
                {repos.length} {repos.length === 1 ? 'repo' : 'repos'}
              </span>
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                style={{ transform: 'rotate(-90deg)', opacity: 0.3 }}>
                <path
                  d="M5.75 9.5L12 15.75L18.25 9.5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
          </button>
          <button onClick={onOpenSettings} style={{ ...settingsRowStyle, borderBottom: 'none' }}>
            <span>Default Labels</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 12, color: colors.textSecondary }}>visual-issue</span>
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                style={{ transform: 'rotate(-90deg)', opacity: 0.3 }}>
                <path
                  d="M5.75 9.5L12 15.75L18.25 9.5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
