import { useState, useEffect, useRef } from 'react';

interface LabelSelectProps {
  repo: string;
  selected: string[];
  onChange: (labels: string[]) => void;
}

interface Label {
  name: string;
  color: string;
}

const colors = {
  inputBg: 'var(--bg-input)',
  border: 'var(--border-default)',
  textPrimary: 'var(--text-primary)',
  textMuted: 'var(--text-muted)',
  purpleAccent: 'var(--accent-subtle)',
  dropdownBg: 'var(--bg-secondary)',
} as const;

export default function LabelSelect({ repo, selected, onChange }: LabelSelectProps) {
  const [labels, setLabels] = useState<Label[]>([]);
  const [open, setOpen] = useState(false);
  const [fallback, setFallback] = useState(false);
  const [fallbackValue, setFallbackValue] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!repo) return;
    setLabels([]);
    setFallback(false);
    chrome.runtime
      .sendMessage({ type: 'FETCH_LABELS', payload: { repo } })
      .then((response: { success: boolean; labels?: Label[] }) => {
        if (response?.success && response.labels) {
          setLabels(response.labels);
        } else {
          setFallback(true);
        }
      })
      .catch(() => {
        setFallback(true);
      });
  }, [repo]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const toggleLabel = (name: string) => {
    if (selected.includes(name)) {
      onChange(selected.filter(l => l !== name));
    } else {
      onChange([...selected, name]);
    }
  };

  const handleFallbackKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && fallbackValue.trim()) {
      const label = fallbackValue.trim();
      if (!selected.includes(label)) {
        onChange([...selected, label]);
      }
      setFallbackValue('');
    }
  };

  if (fallback) {
    return (
      <div style={{ flex: 1 }}>
        <label
          htmlFor="label-fallback-input"
          style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6, display: 'block' }}>
          Labels
        </label>
        <input
          id="label-fallback-input"
          type="text"
          placeholder="Type label, press Enter"
          value={fallbackValue}
          onChange={e => setFallbackValue(e.target.value)}
          onKeyDown={handleFallbackKeyDown}
          style={{
            width: '100%',
            background: colors.inputBg,
            border: `1px solid ${colors.border}`,
            borderRadius: 8,
            padding: '8px 12px',
            color: colors.textPrimary,
            fontSize: 13,
            outline: 'none',
            boxSizing: 'border-box',
            transition: 'all 0.15s',
          }}
        />
        {selected.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
            {selected.map(label => (
              <button
                key={label}
                type="button"
                onClick={() => onChange(selected.filter(l => l !== label))}
                style={{
                  fontSize: 11,
                  padding: '2px 8px',
                  borderRadius: 10,
                  background: 'var(--accent-20)',
                  color: 'var(--accent-link)',
                  cursor: 'pointer',
                  border: 'none',
                  transition: 'all 0.15s',
                }}>
                {label}{' '}
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  style={{ marginLeft: 2 }}>
                  <path
                    d="M6.25 6.25L17.75 17.75M17.75 6.25L6.25 17.75"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div ref={containerRef} style={{ flex: 1, position: 'relative' }}>
      <label
        htmlFor="label-select-btn"
        style={{ fontSize: 12, color: colors.textMuted, marginBottom: 4, display: 'block' }}>
        Labels
      </label>
      <button
        id="label-select-btn"
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          width: '100%',
          background: colors.inputBg,
          border: `1px solid ${colors.border}`,
          borderRadius: 8,
          padding: '8px 12px',
          color: selected.length > 0 ? colors.textPrimary : colors.textMuted,
          fontSize: 13,
          textAlign: 'left',
          cursor: 'pointer',
          outline: 'none',
          boxSizing: 'border-box',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          transition: 'all 0.15s',
        }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selected.length === 0 ? 'Select labels' : selected.length === 1 ? selected[0] : `${selected.length} labels`}
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
            maxHeight: 200,
            overflowY: 'auto',
            zIndex: 10,
            boxShadow: '0 8px 24px var(--shadow-dropdown)',
          }}>
          {labels.length === 0 && (
            <div style={{ padding: '10px 12px', fontSize: 13, color: colors.textMuted }}>No labels found</div>
          )}
          {labels.map(label => {
            const isSelected = selected.includes(label.name);
            return (
              <button
                key={label.name}
                type="button"
                onClick={() => toggleLabel(label.name)}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 12px',
                  background: isSelected ? 'var(--accent-15)' : 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: colors.textPrimary,
                  fontSize: 13,
                  textAlign: 'left',
                  boxSizing: 'border-box',
                  transition: 'all 0.15s',
                }}>
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    background: `#${label.color}`,
                    flexShrink: 0,
                  }}
                />
                <span style={{ flex: 1 }}>{label.name}</span>
                {isSelected && <span style={{ color: colors.purpleAccent, fontSize: 14 }}>&#10003;</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
