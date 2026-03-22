import type { PageIssue } from '@extension/shared';

interface IssueCardProps {
  issue: PageIssue;
}

const timeAgo = (dateString: string): string => {
  const now = Date.now();
  const date = new Date(dateString).getTime();
  const seconds = Math.floor((now - date) / 1000);

  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
};

export default function IssueCard({ issue }: IssueCardProps) {
  const isOpen = issue.state === 'open';

  const handleClick = () => {
    chrome.tabs.create({ url: issue.html_url });
  };

  return (
    <button
      onClick={handleClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        width: '100%',
        padding: '10px 12px',
        background: 'rgba(148,163,184,0.08)',
        border: '1px solid rgba(148,163,184,0.15)',
        borderRadius: 8,
        cursor: 'pointer',
        textAlign: 'left',
        color: '#f1f5f9',
        fontFamily: 'DM Sans, -apple-system, BlinkMacSystemFont, sans-serif',
        boxSizing: 'border-box',
      }}>
      {/* Thumbnail placeholder */}
      <div
        style={{
          width: 48,
          height: 36,
          borderRadius: 4,
          background: 'rgba(139,92,246,0.15)',
          border: '1px solid rgba(139,92,246,0.2)',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}>
        {issue.screenshot_url ? (
          <img
            src={issue.screenshot_url}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 3 }}
          />
        ) : (
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <rect x="1" y="3" width="14" height="10" rx="1.5" stroke="#8b5cf6" strokeWidth="1" opacity="0.5" />
            <circle cx="5" cy="7" r="1.5" stroke="#8b5cf6" strokeWidth="1" opacity="0.5" />
            <path d="M4 12L7 9L9 11L11 8L13 12" stroke="#8b5cf6" strokeWidth="1" opacity="0.5" />
          </svg>
        )}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 500,
            lineHeight: 1.3,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
          {issue.title}
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginTop: 4,
            fontSize: 11,
            color: 'rgba(241,245,249,0.4)',
          }}>
          {/* Status badge */}
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 11,
            }}>
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: isOpen ? '#4ade80' : '#94a3b8',
                flexShrink: 0,
              }}
            />
            {isOpen ? 'Open' : 'Closed'}
          </span>
          <span>#{issue.number}</span>
          <span>{timeAgo(issue.created_at)}</span>
        </div>
      </div>
    </button>
  );
}
