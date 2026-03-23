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

  const handleRepoChange = (repo: string) => {
    setSelectedRepo(repo);
    chrome.storage.sync.set({ selectedRepo: repo });
  };

  const handleToolClick = (tool: 'select' | 'pencil' | 'inspect') => {
    setActiveTool(prev => (prev === tool ? null : tool));
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
        minHeight: '100vh',
        background: '#0f172a',
        color: colors.textPrimary,
        boxSizing: 'border-box',
      }}>
      {/* Header */}
      <div style={{ padding: '28px 20px 0' }}>
        <h1
          style={{
            fontSize: 26,
            margin: 0,
            color: colors.textPrimary,
            lineHeight: 1.2,
          }}>
          Coworker
        </h1>
        <p style={{ margin: '6px 0 0', color: colors.textSecondary, fontSize: 13 }}>Visual issue reporting</p>
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
        <h2 style={sectionHeadingStyle}>Settings</h2>
        <div style={{ marginTop: 8 }}>
          <button onClick={onOpenSettings} style={settingsRowStyle}>
            <span>GitHub Token</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 12, color: patConnected ? colors.green : colors.textSecondary }}>
                {patConnected ? 'Connected' : 'Not connected'}
              </span>
              <span style={{ fontSize: 14, color: 'rgba(148,163,184,0.3)' }}>›</span>
            </span>
          </button>
          <button onClick={onOpenSettings} style={settingsRowStyle}>
            <span>Repositories</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 12, color: colors.textSecondary }}>
                {repos.length} {repos.length === 1 ? 'repo' : 'repos'}
              </span>
              <span style={{ fontSize: 14, color: 'rgba(148,163,184,0.3)' }}>›</span>
            </span>
          </button>
          <button onClick={onOpenSettings} style={{ ...settingsRowStyle, borderBottom: 'none' }}>
            <span>Default Labels</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 12, color: colors.textSecondary }}>visual-issue</span>
              <span style={{ fontSize: 14, color: 'rgba(148,163,184,0.3)' }}>›</span>
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
