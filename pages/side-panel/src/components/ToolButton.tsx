interface ToolButtonProps {
  icon: 'select' | 'pencil';
  label: string;
  active: boolean;
  onClick: () => void;
}

const SelectIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="2" y="2" width="16" height="16" rx="2" stroke="currentColor" strokeWidth="1.5" />
    <rect x="5" y="5" width="10" height="10" rx="1" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2 2" />
  </svg>
);

const PencilIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M13.5 3.5L16.5 6.5L6.5 16.5H3.5V13.5L13.5 3.5Z"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path d="M11.5 5.5L14.5 8.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

export default function ToolButton({ icon, label, active, onClick }: ToolButtonProps) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        padding: '12px 16px',
        borderRadius: 10,
        border: `1px solid ${active ? 'rgba(139,92,246,0.5)' : 'rgba(139,92,246,0.3)'}`,
        background: active ? 'rgba(139,92,246,0.2)' : 'transparent',
        color: active ? '#a78bfa' : '#f1f5f9',
        fontFamily: 'DM Sans, -apple-system, BlinkMacSystemFont, sans-serif',
        fontSize: 14,
        fontWeight: 500,
        cursor: 'pointer',
        boxShadow: active ? '0 0 16px rgba(139,92,246,0.25), inset 0 0 12px rgba(139,92,246,0.1)' : 'none',
        transition: 'all 0.15s ease',
      }}>
      {icon === 'select' ? <SelectIcon /> : <PencilIcon />}
      {label}
    </button>
  );
}
