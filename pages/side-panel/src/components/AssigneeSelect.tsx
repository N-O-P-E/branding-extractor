import { useState, useEffect, useRef } from 'react';

interface AssigneeSelectProps {
  repo: string;
  selected: string;
  onChange: (assignee: string) => void;
}

interface Assignee {
  login: string;
  avatar_url: string;
}

const colors = {
  inputBg: 'var(--bg-input)',
  border: 'var(--border-default)',
  textPrimary: 'var(--text-primary)',
  textMuted: 'var(--text-muted)',
  purpleAccent: 'var(--accent-subtle)',
  dropdownBg: 'var(--bg-secondary)',
} as const;

export default function AssigneeSelect({ repo, selected, onChange }: AssigneeSelectProps) {
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [open, setOpen] = useState(false);
  const [fallback, setFallback] = useState(false);
  const [search, setSearch] = useState('');
  const [highlightIndex, setHighlightIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [tokenUser, setTokenUser] = useState('');

  useEffect(() => {
    // Get the authenticated user's login to put them first
    chrome.runtime.sendMessage({ type: 'CHECK_TOKEN_STATUS' }, (response: { connected: boolean; login?: string }) => {
      if (response?.login) setTokenUser(response.login);
    });
  }, []);

  useEffect(() => {
    if (!repo) return;
    setAssignees([]);
    setFallback(false);
    chrome.runtime
      .sendMessage({ type: 'FETCH_ASSIGNEES', payload: { repo } })
      .then((response: { success: boolean; assignees?: Assignee[] }) => {
        if (response?.success && response.assignees) {
          // Sort: token user first, then alphabetical
          const sorted = [...response.assignees].sort((a, b) => {
            if (a.login === tokenUser) return -1;
            if (b.login === tokenUser) return 1;
            return a.login.localeCompare(b.login);
          });
          setAssignees(sorted);
          // Pre-select the token user if nothing selected yet
          if (!selected && tokenUser && sorted.some(a => a.login === tokenUser)) {
            onChange(tokenUser);
          }
        } else {
          setFallback(true);
        }
      })
      .catch(() => {
        setFallback(true);
      });
  }, [repo, tokenUser]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  if (fallback) {
    return (
      <div style={{ flex: 1 }}>
        <label
          htmlFor="assignee-fallback-input"
          style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6, display: 'block' }}>
          Assignee
        </label>
        <input
          id="assignee-fallback-input"
          type="text"
          placeholder="GitHub username"
          value={selected}
          onChange={e => onChange(e.target.value)}
          style={{
            width: '100%',
            background: colors.inputBg,
            border: `1px solid ${colors.border}`,
            borderRadius: 8,
            padding: '8px 10px',
            color: colors.textPrimary,
            fontSize: 13,
            outline: 'none',
            boxSizing: 'border-box',
            transition: 'all 0.15s',
          }}
        />
      </div>
    );
  }

  return (
    <div ref={containerRef} style={{ flex: 1, position: 'relative' }}>
      <label
        htmlFor="assignee-select-btn"
        style={{
          fontSize: 12,
          color: 'var(--text-secondary)',
          marginBottom: 4,
          display: 'block',
        }}>
        Assignee
      </label>
      <button
        id="assignee-select-btn"
        type="button"
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (next) {
            setSearch('');
            setTimeout(() => searchRef.current?.focus(), 0);
          }
        }}
        style={{
          width: '100%',
          minWidth: 0,
          background: colors.inputBg,
          border: `1px solid ${colors.border}`,
          borderRadius: 8,
          padding: '8px 10px',
          color: selected ? colors.textPrimary : colors.textMuted,
          fontSize: 13,
          textAlign: 'left',
          cursor: 'pointer',
          outline: 'none',
          boxSizing: 'border-box',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          transition: 'all 0.15s',
        }}>
        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selected || 'Select assignee'}
        </span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          style={{
            flexShrink: 0,
            marginLeft: 4,
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.15s',
          }}>
          <path
            d="M5.75 9.5L12 15.75L18.25 9.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            marginTop: 4,
            background: colors.dropdownBg,
            border: `1px solid ${colors.border}`,
            borderRadius: 8,
            zIndex: 10,
            boxShadow: '0 8px 24px var(--shadow-dropdown)',
            overflow: 'hidden',
          }}>
          {/* Search input */}
          <div style={{ padding: '6px 8px', borderBottom: `1px solid ${colors.border}` }}>
            <input
              ref={searchRef}
              type="text"
              placeholder="Search..."
              value={search}
              onChange={e => {
                setSearch(e.target.value);
                setHighlightIndex(0);
              }}
              onKeyDown={e => {
                const filtered = assignees.filter(a => a.login.toLowerCase().includes(search.toLowerCase()));
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setHighlightIndex(i => Math.min(i + 1, filtered.length - 1));
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setHighlightIndex(i => Math.max(i - 1, 0));
                } else if (e.key === 'Enter') {
                  e.preventDefault();
                  const item = filtered[highlightIndex];
                  if (item) {
                    onChange(item.login);
                    setOpen(false);
                  }
                }
              }}
              style={{
                width: '100%',
                background: 'var(--bg-input-hover)',
                border: 'none',
                borderRadius: 4,
                padding: '6px 8px',
                color: colors.textPrimary,
                fontSize: 12,
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>
          <div style={{ maxHeight: 180, overflowY: 'auto' }}>
            {assignees
              .filter(a => a.login.toLowerCase().includes(search.toLowerCase()))
              .map((assignee, idx) => {
                const isSelected = selected === assignee.login;
                const isHighlighted = idx === highlightIndex;
                return (
                  <button
                    key={assignee.login}
                    type="button"
                    onClick={() => {
                      onChange(assignee.login);
                      setOpen(false);
                    }}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '8px 12px',
                      background: isHighlighted ? 'var(--accent-20)' : isSelected ? 'var(--accent-10)' : 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      color: colors.textPrimary,
                      fontSize: 13,
                      textAlign: 'left',
                      boxSizing: 'border-box',
                      transition: 'all 0.15s',
                    }}>
                    <img
                      src={assignee.avatar_url}
                      alt={assignee.login}
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: '50%',
                        flexShrink: 0,
                      }}
                    />
                    <span style={{ flex: 1 }}>{assignee.login}</span>
                    {isSelected && <span style={{ color: colors.purpleAccent, fontSize: 14 }}>&#10003;</span>}
                  </button>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}
