import { parseSessionFile } from '@extension/exporter';
import { deleteBranding, saveBranding } from '@extension/storage';
import { useCallback, useRef } from 'react';
import type { SavedBranding } from '@extension/storage';

interface Props {
  brandings: SavedBranding[];
  onSelect: (branding: SavedBranding) => void;
  onDeleted: (id: string) => void;
  onImported: (branding: SavedBranding) => void;
  onSaveCurrent?: () => void;
  hasCurrentResult: boolean;
}

const formatDate = (timestamp: number): string => {
  const date = new Date(timestamp);
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

export const BrandingsView = ({
  brandings,
  onSelect,
  onDeleted,
  onImported,
  onSaveCurrent,
  hasCurrentResult,
}: Props) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDelete = useCallback(
    async (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      await deleteBranding(id);
      onDeleted(id);
    },
    [onDeleted],
  );

  const handleImportClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      // Reset so re-selecting the same file triggers the event again
      e.target.value = '';

      try {
        const text = await file.text();
        const session = parseSessionFile(text);

        const hostname = (() => {
          try {
            return new URL(session.origin).hostname;
          } catch {
            return session.name;
          }
        })();

        const favicon = `https://www.google.com/s2/favicons?domain=${hostname}`;

        const newBranding: SavedBranding = {
          id: crypto.randomUUID(),
          name: session.name,
          url: session.originalExtraction.url,
          origin: session.origin,
          favicon,
          data: session.originalExtraction,
          overrides: session.overrides,
          enabled: false,
          savedAt: Date.now(),
          updatedAt: Date.now(),
        };

        await saveBranding(newBranding);
        onImported(newBranding);
      } catch (err) {
        console.error('Failed to import branding session:', err);
      }
    },
    [onImported],
  );

  return (
    <div className="flex flex-col gap-3 p-4">
      {/* Hidden file input for import */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        className="hidden"
        onChange={handleFileChange}
        aria-hidden="true"
      />

      <div className="flex gap-2">
        {hasCurrentResult && onSaveCurrent && (
          <button
            type="button"
            onClick={onSaveCurrent}
            className="flex-1 rounded-lg py-2 text-sm font-medium text-white transition-colors"
            style={{ background: 'var(--accent-gradient)' }}>
            Save Current
          </button>
        )}
        <button
          type="button"
          onClick={handleImportClick}
          className="flex-1 rounded-lg py-2 text-sm font-medium transition-colors"
          style={{
            border: '1px solid var(--border-default)',
            color: 'var(--text-secondary)',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--accent-primary)';
            (e.currentTarget as HTMLButtonElement).style.color = 'var(--accent-subtle)';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-default)';
            (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)';
          }}>
          Import
        </button>
      </div>

      {brandings.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ color: 'var(--text-muted)' }}
            aria-hidden="true">
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
            <polyline points="17 21 17 13 7 13 7 21" />
            <polyline points="7 3 7 8 15 8" />
          </svg>
          <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
            No saved brandings yet
          </p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Extract a page then click &ldquo;Save Current&rdquo;
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {brandings.map(branding => (
            <button
              key={branding.id}
              type="button"
              onClick={() => onSelect(branding)}
              className="group relative flex items-start gap-3 rounded-lg p-3 text-left transition-colors"
              style={{
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border-default)',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--accent-primary)';
                (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--bg-hover)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-default)';
                (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--bg-secondary)';
              }}>
              {/* Favicon */}
              <div
                className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md"
                style={{ backgroundColor: 'var(--bg-hover)' }}>
                {branding.favicon ? (
                  <img src={branding.favicon} alt="" className="h-5 w-5" aria-hidden="true" />
                ) : (
                  <span className="text-[10px] font-semibold" style={{ color: 'var(--text-muted)' }}>
                    {branding.name.slice(0, 2).toUpperCase()}
                  </span>
                )}
              </div>

              {/* Content */}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                  {branding.name}
                </p>
                <p className="truncate text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  {branding.url}
                </p>
                <div className="mt-1.5 flex items-center gap-2">
                  {/* Color swatch preview */}
                  <div className="flex gap-0.5">
                    {branding.data.colors.slice(0, 5).map(color => (
                      <span
                        key={color.hex}
                        className="block h-3.5 w-3.5 rounded-sm ring-1 ring-white/10"
                        style={{ backgroundColor: color.hex }}
                        aria-hidden="true"
                      />
                    ))}
                  </div>
                  <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                    {formatDate(branding.savedAt)}
                  </span>
                </div>
              </div>

              {/* Delete button */}
              <button
                type="button"
                aria-label={`Delete ${branding.name}`}
                onClick={e => handleDelete(e, branding.id)}
                className="shrink-0 rounded p-1 opacity-0 transition-opacity group-hover:opacity-100"
                style={{ color: 'var(--text-muted)' }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'rgba(248, 113, 113, 0.15)';
                  (e.currentTarget as HTMLButtonElement).style.color = 'var(--status-error)';
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
                  (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)';
                }}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                  <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
