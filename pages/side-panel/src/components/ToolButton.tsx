import { useState } from 'react';

interface ToolButtonProps {
  icon: 'select' | 'pencil' | 'inspect';
  label: string;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
}

const SelectIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M5.7 3.75V3.75C4.62304 3.75 3.75 4.62305 3.75 5.7V5.75M18.25 3.75V3.75C19.3546 3.75 20.25 4.64543 20.25 5.75V5.75M3.75 18.25V18.3C3.75 19.377 4.62304 20.25 5.7 20.25V20.25M18.25 20.25V20.25C19.3546 20.25 20.25 19.3546 20.25 18.25V18.25M10.25 3.75H13.75M20.25 10.25V13.75M13.75 20.25H10.25M3.75 13.75V10.25"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const PencilIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M12 2.75C6.89137 2.75 2.75 6.89137 2.75 12C2.75 17.1086 6.89137 21.25 12 21.25C17.1086 21.25 21.25 17.1086 21.25 12C21.25 4.29167 9.94444 5.31944 8.40278 9.94444"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const InspectIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M3.75 4.75C3.75 4.19772 4.19772 3.75 4.75 3.75H7.25C7.80228 3.75 8.25 4.19772 8.25 4.75V7.25C8.25 7.80228 7.80228 8.25 7.25 8.25H4.75C4.19772 8.25 3.75 7.80228 3.75 7.25V4.75Z"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="square"
      strokeLinejoin="round"
    />
    <path
      d="M15.75 4.75C15.75 4.19772 16.1977 3.75 16.75 3.75H19.25C19.8023 3.75 20.25 4.19772 20.25 4.75V7.25C20.25 7.80228 19.8023 8.25 19.25 8.25H18H16.75C16.1977 8.25 15.75 7.80228 15.75 7.25V6V4.75Z"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="square"
      strokeLinejoin="round"
    />
    <path
      d="M3.75 16.75C3.75 16.1977 4.19772 15.75 4.75 15.75H7C7.55228 15.75 8 16.1977 8 16.75V18V19.25C8 19.8023 7.55228 20.25 7 20.25H4.75C4.19772 20.25 3.75 19.8023 3.75 19.25V16.75Z"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="square"
      strokeLinejoin="round"
    />
    <path
      d="M19.7473 14.2136L12.9157 12.2617C12.5164 12.1476 12.1471 12.5169 12.2613 12.9162L14.2131 19.7478C14.3436 20.2045 14.9631 20.2716 15.1883 19.8533L16.7456 16.9612C16.7947 16.87 16.8695 16.7952 16.9607 16.7461L19.8528 15.1888C20.2711 14.9636 20.204 14.3441 19.7473 14.2136Z"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="square"
      strokeLinejoin="round"
    />
    <path d="M15.75 6H8.25" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M6 8.25V15.75" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M18 8.25V10.25" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M8 18H10.25" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const icons = { select: SelectIcon, pencil: PencilIcon, inspect: InspectIcon };

export default function ToolButton({ icon, label, active, disabled, onClick }: ToolButtonProps) {
  const [hovered, setHovered] = useState(false);
  const Icon = icons[icon];

  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      onMouseEnter={() => !disabled && setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        padding: '12px 8px',
        borderRadius: 10,
        border: `1px solid ${disabled ? 'var(--border-subtle)' : active ? 'var(--tool-border-hover)' : hovered ? 'var(--tool-border-hover)' : 'var(--tool-border)'}`,
        background: disabled
          ? 'transparent'
          : active
            ? 'var(--tool-bg-active)'
            : hovered
              ? 'var(--tool-bg-hover)'
              : 'transparent',
        color: disabled ? 'var(--text-muted)' : 'var(--text-primary)',
        fontFamily: 'var(--font-body)',
        fontSize: 13,
        minWidth: 0,
        fontWeight: 500,
        cursor: disabled ? 'not-allowed' : 'pointer',
        boxShadow: active
          ? '0 0 16px var(--tool-shadow), inset 0 0 12px var(--tool-shadow-hover)'
          : hovered
            ? '0 4px 12px var(--tool-shadow-hover)'
            : 'none',
        transform: hovered && !active && !disabled ? 'translateY(-1px)' : 'none',
        transition: 'all 0.15s ease',
      }}>
      <Icon />
      {label}
    </button>
  );
}
