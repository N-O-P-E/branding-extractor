interface Props {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  hasOverrides: boolean;
}

const OverrideToggle = ({ enabled, onToggle, hasOverrides }: Props) => {
  if (!hasOverrides) return null;

  return (
    <button
      type="button"
      onClick={() => onToggle(!enabled)}
      className="flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors"
      style={
        enabled
          ? {
              border: '1px solid var(--accent-primary)',
              color: 'var(--accent-subtle)',
            }
          : {
              border: '1px solid var(--border-default)',
              color: 'var(--text-secondary)',
            }
      }
      aria-pressed={enabled}
      title={
        enabled
          ? 'Showing modified values — click to view originals'
          : 'Showing original values — click to view modified'
      }>
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: enabled ? 'var(--accent-primary)' : 'var(--text-muted)' }}
        aria-hidden="true"
      />
      {enabled ? 'Modified' : 'Original'}
    </button>
  );
};

export { OverrideToggle };
