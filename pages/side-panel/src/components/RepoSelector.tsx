interface RepoSelectorProps {
  selectedRepo: string;
  repos: string[];
  onChange: (repo: string) => void;
}

export default function RepoSelector({ selectedRepo, repos, onChange }: RepoSelectorProps) {
  return (
    <div>
      <h2
        style={{
          fontSize: 18,
          margin: '0 0 8px',
          color: '#a78bfa',
        }}>
        <label htmlFor="repo-selector">Repository</label>
      </h2>
      <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
        <select
          id="repo-selector"
          value={selectedRepo}
          onChange={e => onChange(e.target.value)}
          style={{
            width: '100%',
            background: 'rgba(148,163,184,0.08)',
            border: '1px solid rgba(148,163,184,0.15)',
            borderRadius: 8,
            padding: '10px 14px',
            color: '#f1f5f9',
            fontFamily: 'DM Sans, -apple-system, BlinkMacSystemFont, sans-serif',
            fontSize: 14,
            outline: 'none',
            appearance: 'none',
            WebkitAppearance: 'none',
            cursor: 'pointer',
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath d='M3 4.5L6 7.5L9 4.5' fill='none' stroke='%2394a3b8' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'right 12px center',
            paddingRight: 32,
            boxSizing: 'border-box',
            transition: 'all 0.15s',
          }}>
          {repos.length === 0 && (
            <option value="" disabled>
              No repositories configured
            </option>
          )}
          {repos.map(repo => (
            <option key={repo} value={repo} style={{ background: '#1e293b' }}>
              {repo}
            </option>
          ))}
        </select>
        {selectedRepo && (
          <button
            onClick={() => chrome.tabs.create({ url: `https://github.com/${selectedRepo}` })}
            title="Open on GitHub"
            style={{
              background: 'rgba(148,163,184,0.08)',
              border: '1px solid rgba(148,163,184,0.15)',
              borderRadius: 8,
              width: 40,
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: 'rgba(241,245,249,0.5)',
              transition: 'all 0.15s',
            }}>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
