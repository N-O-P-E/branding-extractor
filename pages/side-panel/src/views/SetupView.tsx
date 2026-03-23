import { useState, useEffect, useCallback } from 'react';

interface SetupViewProps {
  onDone: () => void;
}

const colors = {
  bg: '#0f172a',
  textPrimary: '#f1f5f9',
  textSecondary: 'rgba(241,245,249,0.45)',
  textMuted: 'rgba(241,245,249,0.3)',
  purpleAccent: '#a78bfa',
  green: '#4ade80',
  inputBg: 'rgba(148,163,184,0.08)',
  border: 'rgba(148,163,184,0.15)',
  error: '#f87171',
} as const;

interface GitHubRepo {
  full_name: string;
  description: string | null;
}

export default function SetupView({ onDone }: SetupViewProps) {
  const [pat, setPat] = useState('');
  const [patStatus, setPatStatus] = useState<'idle' | 'validating' | 'valid' | 'invalid'>('idle');
  const [patUser, setPatUser] = useState('');
  const [repos, setRepos] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);

  // Searchable repo picker state
  const [availableRepos, setAvailableRepos] = useState<GitHubRepo[]>([]);
  const [reposLoading, setReposLoading] = useState(false);
  const [repoSearch, setRepoSearch] = useState('');
  const [repoDropdownOpen, setRepoDropdownOpen] = useState(false);

  useEffect(() => {
    chrome.storage.sync.get(['githubPat', 'repoList']).then(result => {
      if (result.githubPat) {
        setPat(result.githubPat as string);
        setPatStatus('valid');
      }
      if (result.repoList) {
        setRepos(result.repoList as string[]);
      }
    });
  }, []);

  // Fetch available repos when token is valid
  const fetchAvailableRepos = useCallback(() => {
    setReposLoading(true);
    chrome.runtime.sendMessage(
      { type: 'FETCH_REPOS' },
      (response: { success: boolean; repos?: GitHubRepo[]; error?: string }) => {
        if (response?.success && response.repos) {
          setAvailableRepos(response.repos);
        }
        setReposLoading(false);
      },
    );
  }, []);

  useEffect(() => {
    if (patStatus === 'valid') {
      fetchAvailableRepos();
    }
  }, [patStatus, fetchAvailableRepos]);

  const filteredRepos = availableRepos.filter(
    r => !repos.includes(r.full_name) && r.full_name.toLowerCase().includes(repoSearch.toLowerCase()),
  );

  const addRepo = useCallback(
    (repoName: string) => {
      if (repos.includes(repoName)) return;
      const updated = [...repos, repoName];
      setRepos(updated);
      setRepoSearch('');
      setRepoDropdownOpen(false);
      chrome.storage.sync.set({ repoList: updated });
      chrome.storage.sync.get('selectedRepo').then(result => {
        if (!result.selectedRepo) {
          chrome.storage.sync.set({ selectedRepo: updated[0] });
        }
      });
      flashSaved();
    },
    [repos],
  );

  const flashSaved = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const validateToken = useCallback(async () => {
    if (!pat.trim()) return;
    setPatStatus('validating');
    setPatUser('');
    try {
      const response = await fetch('https://api.github.com/user', {
        headers: { Authorization: `Bearer ${pat.trim()}` },
      });
      if (response.ok) {
        const user = (await response.json()) as { login: string };
        setPatUser(user.login);
        setPatStatus('valid');
        await chrome.storage.sync.set({ githubPat: pat.trim() });
        flashSaved();
      } else {
        setPatStatus('invalid');
      }
    } catch {
      setPatStatus('invalid');
    }
  }, [pat]);

  const removeRepo = useCallback(
    (repo: string) => {
      const updated = repos.filter(r => r !== repo);
      setRepos(updated);
      chrome.storage.sync.set({ repoList: updated });
      chrome.storage.sync.get('selectedRepo').then(result => {
        if (result.selectedRepo === repo) {
          const next = updated[0] ?? '';
          chrome.storage.sync.set({ selectedRepo: next });
        }
      });
      flashSaved();
    },
    [repos],
  );

  const inputStyle: React.CSSProperties = {
    flex: 1,
    background: colors.inputBg,
    border: `1px solid ${colors.border}`,
    borderRadius: 8,
    padding: '10px 14px',
    color: colors.textPrimary,
    fontSize: 14,
    outline: 'none',
    minWidth: 0,
    transition: 'all 0.15s',
  };

  const buttonStyle: React.CSSProperties = {
    background: 'linear-gradient(135deg, #7c3aed, #9333ea)',
    border: 'none',
    borderRadius: 10,
    padding: '10px 18px',
    color: '#fff',
    fontSize: 14,
    fontWeight: 500,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    flexShrink: 0,
    transition: 'all 0.15s',
  };

  const buttonDisabledStyle: React.CSSProperties = {
    ...buttonStyle,
    opacity: 0.45,
    cursor: 'not-allowed',
  };

  return (
    <div
      style={{
        flex: 1,
        background: colors.bg,
        color: colors.textPrimary,
        padding: '28px 20px 40px',
        boxSizing: 'border-box',
      }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={onDone}
            aria-label="Back"
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
              color: 'rgba(241,245,249,0.6)',
              fontSize: 16,
              padding: 0,
              flexShrink: 0,
              transition: 'all 0.15s',
            }}>
            ←
          </button>
          <h1
            style={{
              fontSize: 26,
              margin: 0,
              color: colors.textPrimary,
              lineHeight: 1.2,
            }}>
            Settings
          </h1>
        </div>
        <p style={{ margin: '6px 0 0', color: colors.textSecondary, fontSize: 13 }}>
          Connect your GitHub account to get started.
        </p>
      </div>

      {/* GitHub Token section */}
      <section style={{ marginBottom: 32 }}>
        <h2
          style={{
            fontSize: 18,
            margin: '0 0 6px',
            color: colors.purpleAccent,
          }}>
          GitHub Token
        </h2>
        <p style={{ margin: '0 0 12px', color: colors.textSecondary, fontSize: 13, lineHeight: 1.5 }}>
          Create a token at{' '}
          <a
            href="https://github.com/settings/tokens/new"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#c4b5fd' }}>
            github.com/settings/tokens
          </a>{' '}
          with <code style={{ background: colors.inputBg, padding: '1px 5px', borderRadius: 4 }}>repo</code> scope.
        </p>
        <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
          <input
            type="password"
            placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
            value={pat}
            style={inputStyle}
            onChange={e => {
              setPat(e.target.value);
              setPatStatus('idle');
              setPatUser('');
            }}
            onKeyDown={e => {
              if (e.key === 'Enter') void validateToken();
            }}
          />
          <button
            style={patStatus === 'validating' || !pat.trim() ? buttonDisabledStyle : buttonStyle}
            onClick={() => void validateToken()}
            disabled={patStatus === 'validating' || !pat.trim()}>
            {patStatus === 'validating' ? '…' : 'Validate'}
          </button>
        </div>
        {patStatus === 'valid' && (
          <div
            style={{ marginTop: 8, fontSize: 13, color: colors.green, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: colors.green,
                display: 'inline-block',
                flexShrink: 0,
              }}
            />
            Connected{patUser ? ` as ${patUser}` : ''}
          </div>
        )}
        {patStatus === 'invalid' && (
          <div style={{ marginTop: 8, fontSize: 13, color: colors.error }}>
            Invalid token — check scopes and try again.
          </div>
        )}
      </section>

      {/* Divider */}
      <div style={{ borderTop: '1px solid rgba(148,163,184,0.1)', margin: '0 0 24px' }} />

      {/* Repositories section */}
      <section style={{ marginBottom: 24 }}>
        <h2
          style={{
            fontSize: 18,
            margin: '0 0 12px',
            color: colors.purpleAccent,
          }}>
          Repositories
        </h2>

        {/* Searchable repo picker */}
        <div style={{ position: 'relative' }}>
          <input
            type="text"
            placeholder={reposLoading ? 'Loading repositories…' : 'Search repositories…'}
            value={repoSearch}
            disabled={reposLoading || patStatus !== 'valid'}
            style={{
              ...inputStyle,
              width: '100%',
              boxSizing: 'border-box',
              opacity: patStatus !== 'valid' ? 0.4 : 1,
            }}
            onFocus={() => setRepoDropdownOpen(true)}
            onChange={e => {
              setRepoSearch(e.target.value);
              setRepoDropdownOpen(true);
            }}
          />
          {repoDropdownOpen && filteredRepos.length > 0 && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                marginTop: 4,
                background: '#1e293b',
                border: `1px solid ${colors.border}`,
                borderRadius: 8,
                maxHeight: 220,
                overflowY: 'auto',
                zIndex: 10,
                boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
              }}>
              {filteredRepos.slice(0, 50).map(repo => (
                <button
                  key={repo.full_name}
                  onClick={() => addRepo(repo.full_name)}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    background: 'none',
                    border: 'none',
                    borderBottom: `1px solid ${colors.border}`,
                    padding: '10px 12px',
                    cursor: 'pointer',
                    color: colors.textPrimary,
                    fontSize: 13,
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => {
                    (e.target as HTMLElement).style.background = 'rgba(139,92,246,0.1)';
                  }}
                  onMouseLeave={e => {
                    (e.target as HTMLElement).style.background = 'none';
                  }}>
                  <div style={{ fontWeight: 500 }}>{repo.full_name}</div>
                  {repo.description && (
                    <div
                      style={{
                        fontSize: 11,
                        color: colors.textSecondary,
                        marginTop: 2,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}>
                      {repo.description}
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
          {repoDropdownOpen && !reposLoading && repoSearch && filteredRepos.length === 0 && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                marginTop: 4,
                background: '#1e293b',
                border: `1px solid ${colors.border}`,
                borderRadius: 8,
                padding: '12px',
                fontSize: 13,
                color: colors.textSecondary,
                boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
              }}>
              No matching repositories found.
            </div>
          )}
        </div>

        {/* Click outside to close dropdown */}
        {repoDropdownOpen && (
          // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
          <div style={{ position: 'fixed', inset: 0, zIndex: 5 }} onClick={() => setRepoDropdownOpen(false)} />
        )}

        {/* Added repos list */}
        {repos.length > 0 && (
          <ul
            style={{
              listStyle: 'none',
              margin: '12px 0 0',
              padding: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
            }}>
            {repos.map(repo => (
              <li
                key={repo}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: colors.inputBg,
                  border: `1px solid ${colors.border}`,
                  borderRadius: 8,
                  padding: '9px 12px',
                  fontSize: 14,
                }}>
                <span style={{ color: colors.textPrimary }}>{repo}</span>
                <button
                  onClick={() => removeRepo(repo)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: colors.textSecondary,
                    cursor: 'pointer',
                    fontSize: 18,
                    lineHeight: 1,
                    padding: '0 2px',
                    display: 'flex',
                    alignItems: 'center',
                    transition: 'all 0.15s',
                  }}
                  aria-label={`Remove ${repo}`}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path
                      d="M6.25 6.25L17.75 17.75M17.75 6.25L6.25 17.75"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        )}
        {repos.length === 0 && patStatus === 'valid' && !reposLoading && (
          <p style={{ marginTop: 10, fontSize: 13, color: colors.textSecondary }}>
            Search and select repositories above.
          </p>
        )}
        {patStatus !== 'valid' && (
          <p style={{ marginTop: 10, fontSize: 13, color: colors.textSecondary }}>Connect your GitHub token first.</p>
        )}
      </section>

      {/* Done button */}
      <button
        onClick={onDone}
        style={{
          ...buttonStyle,
          width: '100%',
          padding: '13px',
          fontSize: 15,
          borderRadius: 10,
          textAlign: 'center',
        }}>
        Done
      </button>

      {/* Saved toast */}
      {saved && (
        <div
          style={{
            position: 'fixed',
            bottom: 24,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(30,41,59,0.96)',
            border: `1px solid ${colors.border}`,
            borderRadius: 8,
            padding: '8px 18px',
            fontSize: 13,
            color: colors.green,
            boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
            whiteSpace: 'nowrap',
          }}>
          Saved
        </div>
      )}
    </div>
  );
}
