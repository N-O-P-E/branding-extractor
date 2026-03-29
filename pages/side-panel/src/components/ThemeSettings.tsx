import { useState } from 'react';
import type { ThemeId, ThemeInfo } from '../hooks/useTheme';

interface Props {
  activeTheme: ThemeId;
  allThemes: ThemeInfo[];
  onChangeTheme: (themeId: ThemeId) => void;
  onActivateCode: (code: string) => { success: boolean; theme?: ThemeInfo; alreadyUnlocked?: boolean };
}

const PROJECT_URL = 'https://github.com/N-O-P-E/branding-extractor';

const ThemeSettings = ({ activeTheme, allThemes, onChangeTheme, onActivateCode }: Props) => {
  const [code, setCode] = useState('');
  const [status, setStatus] = useState<'idle' | 'success' | 'already' | 'error'>('idle');
  const [statusLabel, setStatusLabel] = useState('');

  const handleActivate = () => {
    if (!code.trim()) return;
    const result = onActivateCode(code);
    if (result.success && !result.alreadyUnlocked) {
      setStatus('success');
      setStatusLabel(`${result.theme?.label} theme activated!`);
      setCode('');
    } else if (result.success && result.alreadyUnlocked) {
      setStatus('already');
      setStatusLabel(`${result.theme?.label} already unlocked`);
      setCode('');
    } else {
      setStatus('error');
      setStatusLabel('Double-check and try again');
    }
    setTimeout(() => setStatus('idle'), 3000);
  };

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Theme selector */}
      <div>
        <h3
          className="mb-2 text-sm font-semibold"
          style={{ color: 'var(--accent-subtle)', fontFamily: 'var(--font-heading)' }}>
          Theme
        </h3>

        {allThemes.length > 1 && (
          <div className="mb-3 flex flex-col gap-1.5">
            {allThemes.map(theme => (
              <button
                key={theme.id}
                type="button"
                onClick={() => onChangeTheme(theme.id)}
                className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-all"
                style={{
                  border:
                    activeTheme === theme.id ? '1px solid var(--accent-primary)' : '1px solid var(--border-default)',
                  background: activeTheme === theme.id ? 'var(--accent-10)' : 'transparent',
                  color: activeTheme === theme.id ? 'var(--accent-subtle)' : 'var(--text-secondary)',
                }}>
                <span
                  className="h-2 w-2 rounded-full"
                  style={{
                    backgroundColor: activeTheme === theme.id ? 'var(--accent-primary)' : 'var(--text-muted)',
                  }}
                />
                {theme.label}
              </button>
            ))}
          </div>
        )}

        <p className="mb-2 text-[11px]" style={{ color: 'var(--text-muted)' }}>
          Enter a magic code to unlock a custom branded theme.
        </p>

        <div className="flex gap-2">
          <input
            type="text"
            value={code}
            onChange={e => setCode(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleActivate()}
            placeholder="Enter activation code"
            className="min-w-0 flex-1 rounded-lg px-3 py-2 text-xs outline-none"
            style={{
              background: 'var(--bg-input)',
              border: '1px solid var(--border-input)',
              color: 'var(--text-primary)',
            }}
          />
          <button
            type="button"
            onClick={handleActivate}
            disabled={!code.trim()}
            className="cursor-pointer rounded-lg px-4 py-2 text-xs font-semibold text-white transition-opacity disabled:cursor-default disabled:opacity-40"
            style={{ background: 'var(--accent-gradient)' }}>
            Activate
          </button>
        </div>

        {status !== 'idle' && (
          <p
            className="mt-1.5 text-[11px]"
            style={{
              color:
                status === 'success'
                  ? 'var(--status-success)'
                  : status === 'error'
                    ? 'var(--status-error)'
                    : 'var(--text-muted)',
            }}>
            {statusLabel}
          </p>
        )}
      </div>

      {/* Share CTA */}
      <div>
        <h3
          className="mb-1 text-sm font-semibold"
          style={{ color: 'var(--accent-subtle)', fontFamily: 'var(--font-heading)' }}>
          Want your own branded theme?
        </h3>
        <p className="mb-3 text-[11px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
          Share Branding Extractor and we&apos;ll create a custom theme with your brand colors, fonts, and logo —
          completely free.
        </p>

        <div className="grid grid-cols-2 gap-2">
          <a
            href={`https://x.com/intent/tweet?text=${encodeURIComponent('Just discovered Branding Extractor — a Chrome extension for extracting design systems from any website. Super useful for designers and developers!')}&url=${encodeURIComponent(PROJECT_URL)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-xs font-medium transition-all"
            style={{
              border: '1px solid var(--border-default)',
              background: 'var(--bg-input)',
              color: 'var(--text-secondary)',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLAnchorElement).style.borderColor = 'var(--accent-primary)';
              (e.currentTarget as HTMLAnchorElement).style.color = 'var(--accent-subtle)';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLAnchorElement).style.borderColor = 'var(--border-default)';
              (e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-secondary)';
            }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
            Post on X
          </a>
          <a
            href={`https://www.reddit.com/submit?url=${encodeURIComponent(PROJECT_URL)}&title=${encodeURIComponent('Branding Extractor — Chrome extension for extracting design systems from any website')}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-xs font-medium transition-all"
            style={{
              border: '1px solid var(--border-default)',
              background: 'var(--bg-input)',
              color: 'var(--text-secondary)',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLAnchorElement).style.borderColor = 'var(--accent-primary)';
              (e.currentTarget as HTMLAnchorElement).style.color = 'var(--accent-subtle)';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLAnchorElement).style.borderColor = 'var(--border-default)';
              (e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-secondary)';
            }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z" />
            </svg>
            Share on Reddit
          </a>
          <a
            href={PROJECT_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-xs font-medium transition-all"
            style={{
              border: '1px solid var(--border-default)',
              background: 'var(--bg-input)',
              color: 'var(--text-secondary)',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLAnchorElement).style.borderColor = 'var(--accent-primary)';
              (e.currentTarget as HTMLAnchorElement).style.color = 'var(--accent-subtle)';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLAnchorElement).style.borderColor = 'var(--border-default)';
              (e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-secondary)';
            }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
            </svg>
            Star on GitHub
          </a>
          <a
            href="mailto:makemytheme@studionope.nl?subject=Custom%20theme%20request%20—%20Branding%20Extractor&body=Hi!%20I'd%20love%20a%20custom%20branded%20theme%20for%20Branding%20Extractor.%0A%0ABrand%20name:%20%0AWebsite:%20%0A%0AThanks!"
            className="flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-xs font-medium transition-all"
            style={{
              border: '1px solid var(--border-default)',
              background: 'var(--bg-input)',
              color: 'var(--text-secondary)',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLAnchorElement).style.borderColor = 'var(--accent-primary)';
              (e.currentTarget as HTMLAnchorElement).style.color = 'var(--accent-subtle)';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLAnchorElement).style.borderColor = 'var(--border-default)';
              (e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-secondary)';
            }}>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true">
              <rect x="2" y="4" width="20" height="16" rx="2" />
              <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
            </svg>
            Request via email
          </a>
        </div>

        <p className="mt-3 text-[10px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
          After sharing, email{' '}
          <a href="mailto:makemytheme@studionope.nl" style={{ color: 'var(--accent-subtle)' }} className="font-medium">
            makemytheme@studionope.nl
          </a>{' '}
          with proof and your brand details. We&apos;ll send your activation code within 48 hours.
        </p>
      </div>
    </div>
  );
};

export { ThemeSettings };
