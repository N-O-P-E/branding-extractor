import '@src/Popup.css';
import { useState, useEffect, useCallback } from 'react';
import type {
  FetchPageIssuesMessage,
  FetchPageIssuesResponse,
  MessageResponse,
  PageIssue,
  ShowIssuesPanelMessage,
  StartReportMessage,
} from '@extension/shared';

type View = 'main' | 'settings';

const Popup = () => {
  const [view, setView] = useState<View>('main');
  const [error, setError] = useState<string | null>(null);
  const [repos, setRepos] = useState<string[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<string>('');
  const [hasToken, setHasToken] = useState(false);
  const [issues, setIssues] = useState<PageIssue[]>([]);
  const [issuesLoading, setIssuesLoading] = useState(false);
  const [issuesError, setIssuesError] = useState<string | null>(null);

  // Settings state
  const [pat, setPat] = useState('');
  const [patStatus, setPatStatus] = useState<'idle' | 'validating' | 'valid' | 'invalid'>('idle');
  const [patUser, setPatUser] = useState('');
  const [newRepo, setNewRepo] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    chrome.storage.sync.get(['repoList', 'selectedRepo', 'githubPat']).then(result => {
      const repoList = (result.repoList as string[] | undefined) ?? [];
      setRepos(repoList);
      setHasToken(!!result.githubPat);

      if (result.githubPat) {
        setPat(result.githubPat as string);
        setPatStatus('valid');
      }

      if (result.selectedRepo && repoList.includes(result.selectedRepo as string)) {
        setSelectedRepo(result.selectedRepo as string);
      } else if (repoList.length > 0) {
        setSelectedRepo(repoList[0]);
        chrome.storage.sync.set({ selectedRepo: repoList[0] });
      }
    });
  }, []);

  const isReady = hasToken && repos.length > 0 && !!selectedRepo;

  useEffect(() => {
    if (!isReady) return;

    chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      if (!tab?.url || tab.url.startsWith('chrome://') || tab.url.startsWith('about://')) return;

      setIssuesLoading(true);
      setIssuesError(null);

      const message: FetchPageIssuesMessage = { type: 'FETCH_PAGE_ISSUES', payload: { pageUrl: tab.url } };
      chrome.runtime
        .sendMessage<FetchPageIssuesMessage, FetchPageIssuesResponse>(message)
        .then(response => {
          setIssuesLoading(false);
          if (response?.success && response.issues) {
            setIssues(response.issues);
          } else {
            setIssuesError(response?.error ?? 'Failed to fetch issues');
          }
        })
        .catch(() => {
          setIssuesLoading(false);
          setIssuesError('Failed to fetch issues');
        });
    });
  }, [isReady]);

  const handleRepoChange = (repo: string) => {
    setSelectedRepo(repo);
    chrome.storage.sync.set({ selectedRepo: repo });
  };

  const handleReportIssue = async () => {
    setError(null);

    if (!hasToken) {
      setError('No GitHub token configured.');
      setView('settings');
      return;
    }

    if (!selectedRepo) {
      setError('No repository selected.');
      setView('settings');
      return;
    }

    try {
      const message: StartReportMessage = { type: 'START_REPORT' };
      const response = await chrome.runtime.sendMessage<StartReportMessage, MessageResponse>(message);
      if (response?.success) {
        window.close();
      } else {
        setError(response?.error ?? 'Unknown error');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start report');
    }
  };

  const handleShowOnPage = () => {
    const message: ShowIssuesPanelMessage = { type: 'SHOW_ISSUES_PANEL', payload: { issues } };
    chrome.runtime.sendMessage(message);
    window.close();
  };

  // Settings handlers
  const flashSaved = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const validateToken = useCallback(async () => {
    if (!pat.trim()) return;
    setPatStatus('validating');
    try {
      const response = await fetch('https://api.github.com/user', {
        headers: { Authorization: `Bearer ${pat.trim()}` },
      });
      if (response.ok) {
        const user = (await response.json()) as { login: string };
        setPatUser(user.login);
        setPatStatus('valid');
        setHasToken(true);
        await chrome.storage.sync.set({ githubPat: pat.trim() });
        flashSaved();
      } else {
        setPatStatus('invalid');
        setPatUser('');
      }
    } catch {
      setPatStatus('invalid');
      setPatUser('');
    }
  }, [pat]);

  const addRepo = useCallback(() => {
    const repo = newRepo.trim();
    if (!repo || !repo.includes('/') || repos.includes(repo)) return;
    const updated = [...repos, repo];
    setRepos(updated);
    setNewRepo('');
    chrome.storage.sync.set({ repoList: updated });
    if (!selectedRepo) {
      setSelectedRepo(updated[0]);
      chrome.storage.sync.set({ selectedRepo: updated[0] });
    }
    flashSaved();
  }, [newRepo, repos, selectedRepo]);

  const removeRepo = useCallback(
    (repo: string) => {
      const updated = repos.filter(r => r !== repo);
      setRepos(updated);
      chrome.storage.sync.set({ repoList: updated });
      if (selectedRepo === repo) {
        const next = updated[0] ?? '';
        setSelectedRepo(next);
        chrome.storage.sync.set({ selectedRepo: next });
      }
      flashSaved();
    },
    [repos, selectedRepo],
  );

  if (view === 'settings') {
    return (
      <div className="popup">
        <div className="popup-header">
          <button className="popup-back" onClick={() => setView('main')} aria-label="Back">
            &larr;
          </button>
          <h1 className="popup-title">Settings</h1>
          <div style={{ width: 28 }} />
        </div>

        <section className="settings-section">
          <h2 className="settings-label">GitHub Token</h2>
          <p className="settings-hint">
            Create at{' '}
            <a href="https://github.com/settings/tokens/new" target="_blank" rel="noopener noreferrer">
              github.com/settings/tokens
            </a>{' '}
            with <code>repo</code> scope.
          </p>
          <div className="settings-row">
            <input
              type="password"
              className="settings-input"
              placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
              value={pat}
              onChange={e => {
                setPat(e.target.value);
                setPatStatus('idle');
              }}
            />
            <button
              className="settings-btn"
              onClick={validateToken}
              disabled={patStatus === 'validating' || !pat.trim()}>
              {patStatus === 'validating' ? '...' : 'Validate'}
            </button>
          </div>
          {patStatus === 'valid' && (
            <div className="settings-status status-valid">Valid {patUser && `(${patUser})`}</div>
          )}
          {patStatus === 'invalid' && <div className="settings-status status-invalid">Invalid token</div>}
        </section>

        <section className="settings-section">
          <h2 className="settings-label">Repositories</h2>
          <div className="settings-row">
            <input
              type="text"
              className="settings-input"
              placeholder="owner/repo"
              value={newRepo}
              onChange={e => setNewRepo(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') addRepo();
              }}
            />
            <button className="settings-btn" onClick={addRepo} disabled={!newRepo.trim() || !newRepo.includes('/')}>
              Add
            </button>
          </div>
          {repos.length > 0 && (
            <ul className="settings-repo-list">
              {repos.map(repo => (
                <li key={repo} className="settings-repo-item">
                  <span>{repo}</span>
                  <button className="settings-repo-remove" onClick={() => removeRepo(repo)}>
                    &times;
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {saved && <div className="settings-toast">Saved</div>}
      </div>
    );
  }

  return (
    <div className="popup">
      <div className="popup-header">
        <h1 className="popup-title">APA Coworker</h1>
        <button className="popup-settings" onClick={() => setView('settings')} aria-label="Settings">
          &#9881;
        </button>
      </div>

      <p className="popup-status">{isReady ? 'Ready' : 'Setup required'}</p>

      {repos.length > 0 && (
        <select className="popup-select" value={selectedRepo} onChange={e => handleRepoChange(e.target.value)}>
          {repos.map(repo => (
            <option key={repo} value={repo}>
              {repo}
            </option>
          ))}
        </select>
      )}

      {repos.length === 0 && (
        <p className="popup-hint">
          No repos configured.{' '}
          <button className="popup-link" onClick={() => setView('settings')}>
            Add in Settings
          </button>
        </p>
      )}

      <button className="popup-button" onClick={handleReportIssue} disabled={!isReady}>
        Report Issue
      </button>
      {error && <p className="popup-error">{error}</p>}

      {isReady && (
        <div className="popup-issues">
          <div className="popup-issues-header">
            Issues on this page {!issuesLoading && !issuesError && `(${issues.length})`}
          </div>

          {issuesLoading && <div className="popup-issues-empty">Loading...</div>}

          {issuesError && <div className="popup-issues-error">{issuesError}</div>}

          {!issuesLoading && !issuesError && issues.length === 0 && (
            <div className="popup-issues-empty">No issues reported for this page</div>
          )}

          {!issuesLoading && !issuesError && issues.length > 0 && (
            <>
              <div className="popup-issues-list">
                {issues.map(issue => (
                  <a
                    key={issue.number}
                    href={issue.html_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="popup-issue-item">
                    <span className="popup-issue-number">#{issue.number}</span>
                    <span className="popup-issue-title">{issue.title}</span>
                    <span className={`popup-issue-badge ${issue.state === 'open' ? 'badge-open' : 'badge-closed'}`}>
                      {issue.state}
                    </span>
                    {issue.has_analysis && <span className="popup-issue-badge badge-analyzed">analyzed</span>}
                  </a>
                ))}
              </div>
              <button className="popup-button-secondary" onClick={handleShowOnPage}>
                Show on page
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default Popup;
