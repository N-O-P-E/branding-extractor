import { useState, useEffect, useCallback } from 'react';
import type { ThemeId, ThemeInfo } from '../useTheme';
import type { AutoFixSettings } from '@extension/shared';

interface SetupViewProps {
  onDone: () => void;
  openSection?: string;
  onOpenWizard?: (chapter: 1 | 2) => void;
  theme?: ThemeId;
  onChangeTheme?: (theme: ThemeId) => void;
  availableThemes?: ThemeInfo[];
  onActivateCode?: (code: string) => { success: boolean; theme?: ThemeInfo; alreadyUnlocked?: boolean };
}

const colors = {
  bg: 'var(--bg-primary)',
  textPrimary: 'var(--text-primary)',
  textSecondary: 'var(--text-secondary)',
  textMuted: 'var(--text-muted)',
  purpleAccent: 'var(--accent-subtle)',
  green: 'var(--status-success)',
  inputBg: 'var(--bg-input)',
  border: 'var(--border-default)',
  error: 'var(--status-error)',
} as const;

const DEFAULT_SYSTEM_PROMPT = `You fix visual issues reported via the Visual Issue Reporter Chrome extension.

Each issue contains a screenshot (with annotations), a description, page/store details, environment info (browser, OS, viewport), console errors, and an HTML snippet of the affected element.

The screenshot may have dashed rectangular selections in various colors (purple, red, amber, green, blue, pink, white, black) highlighting problem areas, freehand drawings circling issues, text comments as yellow note boxes, and pasted reference images.

Steps:
1. Read the description and study the annotated screenshot
2. Cross-reference with the HTML snippet, console errors, and environment data
3. Identify the relevant source files in the repository
4. For Shopify themes: use template, theme name, and editor URL to locate the right section/block
5. Create a minimal, targeted fix
6. Open a PR with a clear title referencing the issue

Do not refactor surrounding code. Do not add unrelated features. Fix only what was reported.`;

const MODELS = [
  { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6', desc: 'Latest & fast' },
  { id: 'claude-opus-4-6', label: 'Opus 4.6', desc: 'Most capable' },
  { id: 'claude-sonnet-4', label: 'Sonnet 4', desc: 'Fast & stable' },
  { id: 'claude-haiku-4-5', label: 'Haiku 4.5', desc: 'Cheapest' },
] as const;

const DEFAULT_MODEL = MODELS[0].id;

const buildWorkflowYaml = (systemPrompt: string, model: string): string => {
  // Escape double quotes for the --append-system-prompt arg
  const escaped = systemPrompt.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
  return `name: Claude Code

on:
  issue_comment:
    types: [created]
  pull_request_review_comment:
    types: [created]
  issues:
    types: [opened, assigned, labeled]
  pull_request_review:
    types: [submitted]

concurrency:
  group: claude-\${{ github.event.issue.number || github.event.pull_request.number || github.run_id }}
  cancel-in-progress: true

jobs:
  claude:
    if: |
      (github.event_name == 'issue_comment' && contains(github.event.comment.body, '@claude') && github.event.comment.user.type != 'Bot') ||
      (github.event_name == 'pull_request_review_comment' && contains(github.event.comment.body, '@claude') && github.event.comment.user.type != 'Bot') ||
      (github.event_name == 'pull_request_review' && contains(github.event.review.body, '@claude')) ||
      (github.event_name == 'issues' && github.event.action == 'labeled' && github.event.label.name == 'auto-fix') ||
      (github.event_name == 'issues' && (github.event.action == 'opened' || github.event.action == 'assigned') && (contains(github.event.issue.body, '@claude') || contains(github.event.issue.title, '@claude')))
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write
      issues: write
      id-token: write
      actions: read
    timeout-minutes: 30
    steps:
      - name: Checkout repository
        uses: actions/checkout@v6
        with:
          fetch-depth: 1

      - name: Run Claude Code
        id: claude
        continue-on-error: true
        uses: anthropics/claude-code-action@v1
        with:
          anthropic_api_key: \${{ secrets.ANTHROPIC_API_KEY }}
          label_trigger: "auto-fix"
          claude_args: |
            --model \${{ vars.CLAUDE_MODEL || '${model}' }}
            --append-system-prompt "${escaped}"
            --allowedTools "Edit,MultiEdit,Glob,Grep,LS,Read,Write,Bash(git add:*),Bash(git checkout:*),Bash(git commit:*),Bash(git diff:*),Bash(git log:*),Bash(git status:*),Bash(git branch:*),Bash(git switch:*),Bash(git push:*),Bash(git restore:*),Bash(npm run:*),Bash(npm install:*),Bash(pnpm run:*),Bash(pnpm install:*),Bash(npx:*)"

      - name: Run Claude Code (fallback)
        if: steps.claude.outcome == 'failure'
        uses: anthropics/claude-code-action@v1
        with:
          anthropic_api_key: \${{ secrets.ANTHROPIC_API_KEY }}
          label_trigger: "auto-fix"
          claude_args: |
            --model \${{ vars.CLAUDE_FALLBACK_MODEL || 'claude-haiku-4-5' }}
            --append-system-prompt "${escaped}"
            --allowedTools "Edit,MultiEdit,Glob,Grep,LS,Read,Write,Bash(git add:*),Bash(git checkout:*),Bash(git commit:*),Bash(git diff:*),Bash(git log:*),Bash(git status:*),Bash(git branch:*),Bash(git switch:*),Bash(git push:*),Bash(git restore:*),Bash(npm run:*),Bash(npm install:*),Bash(pnpm run:*),Bash(pnpm install:*),Bash(npx:*)"`;
};

interface GitHubRepo {
  full_name: string;
  description: string | null;
}

/* Chevron icon — rotates when open */
const Chevron = ({ open }: { open: boolean }) => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    style={{
      transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
      transition: 'transform 0.25s ease',
      color: colors.textSecondary,
      flexShrink: 0,
    }}>
    <path
      d="M5.75 9.5L12 15.75L18.25 9.5"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/* Accordion section header */
const SectionHeader = ({
  title,
  status,
  statusColor,
  open,
  onToggle,
}: {
  title: string;
  status?: string;
  statusColor?: string;
  open: boolean;
  onToggle: () => void;
}) => (
  <button
    onClick={onToggle}
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      width: '100%',
      background: 'none',
      border: 'none',
      padding: '0 0 0 0',
      cursor: 'pointer',
      color: colors.textPrimary,
    }}>
    <h2 style={{ fontSize: 18, margin: 0, color: 'var(--heading-color)' }}>{title}</h2>
    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      {status && (
        <span style={{ fontSize: 12, color: statusColor ?? colors.textSecondary, fontWeight: 400 }}>{status}</span>
      )}
      <Chevron open={open} />
    </span>
  </button>
);

export default function SetupView({
  onDone,
  openSection,
  onOpenWizard,
  theme,
  onChangeTheme,
  availableThemes,
  onActivateCode,
}: SetupViewProps) {
  const [pat, setPat] = useState('');
  const [patStatus, setPatStatus] = useState<'idle' | 'validating' | 'valid' | 'invalid'>('idle');
  const [patUser, setPatUser] = useState('');
  const [repos, setRepos] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [repoSecretStatus, setRepoSecretStatus] = useState<Record<string, boolean | null>>({});
  const [repoWorkflowStatus, setRepoWorkflowStatus] = useState<Record<string, boolean | null>>({});

  // Searchable repo picker state
  const [availableRepos, setAvailableRepos] = useState<GitHubRepo[]>([]);
  const [reposLoading, setReposLoading] = useState(false);
  const [repoSearch, setRepoSearch] = useState('');
  const [repoDropdownOpen, setRepoDropdownOpen] = useState(false);

  // Auto-fix settings
  const [anthropicApiKey, setAnthropicApiKey] = useState('');
  const [anthropicKeyStatus, setAnthropicKeyStatus] = useState<'idle' | 'validating' | 'valid' | 'invalid'>('idle');
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_SYSTEM_PROMPT);
  const [selectedModel, setSelectedModel] = useState(DEFAULT_MODEL);
  const [autoFixByDefault, setAutoFixByDefault] = useState(false);

  // Accordion open state — null means "use smart defaults" (set after load)
  const [tokenOpen, setTokenOpen] = useState<boolean | null>(null);
  const [reposOpen, setReposOpen] = useState<boolean | null>(null);
  const [autoFixOpen, setAutoFixOpen] = useState<boolean | null>(null);
  const [contributeOpen, setContributeOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const [activationCode, setActivationCode] = useState('');
  const [activationStatus, setActivationStatus] = useState<'idle' | 'success' | 'error' | 'already'>('idle');
  const [activatedThemeName, setActivatedThemeName] = useState('');
  const [keyCopied, setKeyCopied] = useState(false);
  const [yamlCopied, setYamlCopied] = useState(false);
  const [lastCopiedSnapshot, setLastCopiedSnapshot] = useState<{ model: string; systemPrompt: string } | null>(null);

  useEffect(() => {
    const targeted = !!openSection; // When a specific section is targeted, only open that one

    // Check token status via background — never read the raw PAT
    chrome.runtime.sendMessage({ type: 'CHECK_TOKEN_STATUS' }, (response: { connected: boolean; login?: string }) => {
      if (response?.connected) {
        setPatStatus('valid');
        if (response.login) setPatUser(response.login);
        setTokenOpen(openSection === 'token');
      } else {
        setTokenOpen(targeted ? openSection === 'token' : true);
      }
    });
    chrome.storage.local.get(['repoList']).then(result => {
      if (result.repoList) {
        const list = result.repoList as string[];
        setRepos(list);
        setReposOpen(targeted ? openSection === 'repos' : list.length === 0);
      } else {
        setReposOpen(targeted ? openSection === 'repos' : true);
      }
    });
    // Load auto-fix settings
    chrome.storage.local.get(['autoFixSettings']).then(result => {
      if (result.autoFixSettings) {
        const settings = result.autoFixSettings as AutoFixSettings;

        if (settings.anthropicApiKey) {
          setAnthropicApiKey(settings.anthropicApiKey);
          setAnthropicKeyStatus('valid');
        }
        if (settings.systemPrompt) setSystemPrompt(settings.systemPrompt);
        if (settings.model) setSelectedModel(settings.model);
        if (settings.autoFixByDefault) setAutoFixByDefault(true);
        setAutoFixOpen(targeted ? openSection === 'autofix' : !settings.anthropicApiKey);
      } else {
        setAutoFixOpen(targeted ? openSection === 'autofix' : true);
      }
    });
    if (openSection === 'theme') setThemeOpen(true);
    chrome.storage.local.get(['yamlCopiedSnapshot']).then(result => {
      if (result.yamlCopiedSnapshot) {
        setLastCopiedSnapshot(result.yamlCopiedSnapshot as { model: string; systemPrompt: string });
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Check which repos have the ANTHROPIC_API_KEY secret and workflow
  useEffect(() => {
    if (anthropicKeyStatus !== 'valid' || repos.length === 0) return;
    for (const repo of repos) {
      chrome.runtime.sendMessage(
        { type: 'CHECK_REPO_SECRET', payload: { repo, secretName: 'ANTHROPIC_API_KEY' } },
        (response: { success: boolean; exists?: boolean }) => {
          if (response?.success) setRepoSecretStatus(prev => ({ ...prev, [repo]: !!response.exists }));
        },
      );
      chrome.runtime.sendMessage(
        { type: 'CHECK_REPO_WORKFLOW', payload: { repo } },
        (response: { success: boolean; exists?: boolean }) => {
          if (response?.success) setRepoWorkflowStatus(prev => ({ ...prev, [repo]: !!response.exists }));
        },
      );
    }
  }, [anthropicKeyStatus, repos]);

  const recheckRepos = () => {
    setRepoSecretStatus({});
    setRepoWorkflowStatus({});
    for (const repo of repos) {
      chrome.runtime.sendMessage(
        { type: 'CHECK_REPO_SECRET', payload: { repo, secretName: 'ANTHROPIC_API_KEY' } },
        (response: { success: boolean; exists?: boolean }) => {
          if (response?.success) setRepoSecretStatus(prev => ({ ...prev, [repo]: !!response.exists }));
        },
      );
      chrome.runtime.sendMessage(
        { type: 'CHECK_REPO_WORKFLOW', payload: { repo } },
        (response: { success: boolean; exists?: boolean }) => {
          if (response?.success) setRepoWorkflowStatus(prev => ({ ...prev, [repo]: !!response.exists }));
        },
      );
    }
  };

  const validateAnthropicKey = useCallback(async () => {
    if (!anthropicApiKey.trim()) return;
    setAnthropicKeyStatus('validating');
    try {
      const res = await fetch('https://api.anthropic.com/v1/models', {
        headers: {
          'x-api-key': anthropicApiKey.trim(),
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
      });
      if (res.ok) {
        setAnthropicKeyStatus('valid');
        // Save immediately on successful validation
        const settings: AutoFixSettings = {
          enabled: true,
          anthropicApiKey: anthropicApiKey.trim(),
          systemPrompt: systemPrompt !== DEFAULT_SYSTEM_PROMPT ? systemPrompt : undefined,
          model: selectedModel !== DEFAULT_MODEL ? selectedModel : undefined,
          autoFixByDefault: autoFixByDefault || undefined,
        };

        chrome.storage.local.set({ autoFixSettings: settings });
        flashSaved();
      } else {
        setAnthropicKeyStatus('invalid');
      }
    } catch {
      setAnthropicKeyStatus('invalid');
    }
  }, [anthropicApiKey, systemPrompt, selectedModel]);

  const disconnectAnthropicKey = useCallback(() => {
    setAnthropicApiKey('');
    setAnthropicKeyStatus('idle');
    const settings: AutoFixSettings = { enabled: false };
    chrome.storage.local.set({ autoFixSettings: settings });
    flashSaved();
  }, []);

  const saveAutoFixSettings = useCallback(() => {
    const hasKey = !!anthropicApiKey.trim();
    const settings: AutoFixSettings = {
      enabled: hasKey,
      anthropicApiKey: anthropicApiKey || undefined,
      systemPrompt: systemPrompt !== DEFAULT_SYSTEM_PROMPT ? systemPrompt : undefined,
      model: selectedModel !== DEFAULT_MODEL ? selectedModel : undefined,
      autoFixByDefault: autoFixByDefault || undefined,
    };
    chrome.storage.local.set({ autoFixSettings: settings });
    flashSaved();
  }, [anthropicApiKey, systemPrompt, selectedModel, autoFixByDefault]);

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

  const isYamlStale =
    lastCopiedSnapshot !== null &&
    (lastCopiedSnapshot.model !== selectedModel || lastCopiedSnapshot.systemPrompt !== systemPrompt);

  const addRepo = useCallback(
    (repoName: string) => {
      if (repos.includes(repoName)) return;
      const updated = [...repos, repoName];
      setRepos(updated);
      setRepoSearch('');
      setRepoDropdownOpen(false);
      chrome.storage.local.set({ repoList: updated });
      chrome.storage.local.get('selectedRepo').then(result => {
        if (!result.selectedRepo) {
          chrome.storage.local.set({ selectedRepo: updated[0] });
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

  const validateToken = useCallback(() => {
    if (!pat.trim()) return;
    setPatStatus('validating');
    setPatUser('');
    chrome.runtime.sendMessage(
      { type: 'VALIDATE_TOKEN', payload: { token: pat.trim() } },
      (response: { success: boolean; login?: string; error?: string }) => {
        if (response?.success && response.login) {
          setPatUser(response.login);
          setPatStatus('valid');
          flashSaved();
        } else {
          setPatStatus('invalid');
        }
      },
    );
  }, [pat]);

  const disconnectToken = useCallback(() => {
    chrome.runtime.sendMessage({ type: 'REMOVE_TOKEN' }, () => {
      setPat('');
      setPatStatus('idle');
      setPatUser('');
      setRepos([]);
      setAvailableRepos([]);
      setTokenOpen(true);
    });
  }, []);

  const removeRepo = useCallback(
    (repo: string) => {
      const updated = repos.filter(r => r !== repo);
      setRepos(updated);
      chrome.storage.local.set({ repoList: updated });
      chrome.storage.local.get('selectedRepo').then(result => {
        if (result.selectedRepo === repo) {
          const next = updated[0] ?? '';
          chrome.storage.local.set({ selectedRepo: next });
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
    background: 'var(--accent-gradient)',
    border: 'none',
    borderRadius: 10,
    padding: '10px 18px',
    color: 'var(--text-on-accent)',
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

  // Smart defaults: treat null as false (loading) to avoid flash
  const isTokenOpen = tokenOpen ?? false;
  const isReposOpen = reposOpen ?? false;
  const isAutoFixOpen = autoFixOpen ?? false;

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
            className="icon-btn"
            onClick={onDone}
            aria-label="Back"
            style={{
              background: 'var(--bg-input)',
              border: '1px solid var(--border-input)',
              borderRadius: 8,
              width: 32,
              height: 32,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: 'var(--text-secondary)',
              fontSize: 16,
              padding: 0,
              flexShrink: 0,
              transition: 'all 0.15s',
            }}>
            ←
          </button>
          <h1 style={{ fontSize: 26, margin: 0, color: colors.textPrimary, lineHeight: 1.2 }}>Settings</h1>
        </div>
        <p style={{ margin: '6px 0 0', color: colors.textSecondary, fontSize: 13 }}>
          Connect your GitHub account to get started.
        </p>
      </div>

      {/* ── GitHub Token ── */}
      <section style={{ marginBottom: 0 }}>
        <SectionHeader
          title="GitHub Token"
          status={patStatus === 'valid' ? 'Connected' : undefined}
          statusColor={colors.green}
          open={isTokenOpen}
          onToggle={() => setTokenOpen(o => !o)}
        />
        <div
          style={{
            overflow: 'hidden',
            maxHeight: isTokenOpen ? 400 : 0,
            opacity: isTokenOpen ? 1 : 0,
            transition: 'max-height 0.3s ease, opacity 0.2s ease',
            marginTop: isTokenOpen ? 12 : 0,
          }}>
          <p style={{ margin: '0 0 12px', color: colors.textSecondary, fontSize: 13, lineHeight: 1.5 }}>
            Create a{' '}
            <a
              href="https://github.com/settings/tokens/new?scopes=repo&description=Visual+Issue+Reporter"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'var(--accent-link)' }}>
              classic token
            </a>{' '}
            with the <code style={{ background: colors.inputBg, padding: '1px 5px', borderRadius: 4 }}>repo</code>{' '}
            scope. Works across all your organizations.
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
              style={{
                marginTop: 8,
                fontSize: 13,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}>
              <span style={{ color: colors.green, display: 'flex', alignItems: 'center', gap: 6 }}>
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
              </span>
              <button
                onClick={disconnectToken}
                style={{
                  background: 'none',
                  border: 'none',
                  color: colors.textMuted,
                  fontSize: 11,
                  cursor: 'pointer',
                  padding: '2px 6px',
                  textDecoration: 'underline',
                  transition: 'all 0.15s',
                }}>
                Disconnect
              </button>
            </div>
          )}
          {patStatus === 'invalid' && (
            <div style={{ marginTop: 8, fontSize: 13, color: colors.error }}>
              Invalid token — check scopes and try again.
            </div>
          )}
        </div>
      </section>

      {/* Divider */}
      <div style={{ borderTop: '1px solid var(--border-subtle)', margin: '20px 0' }} />

      {/* ── Repositories ── */}
      <section style={{ marginBottom: 0 }}>
        <SectionHeader
          title="Repositories"
          status={repos.length > 0 ? `${repos.length} ${repos.length === 1 ? 'repo' : 'repos'}` : undefined}
          open={isReposOpen}
          onToggle={() => setReposOpen(o => !o)}
        />
        <div
          style={{
            overflow: isReposOpen ? 'visible' : 'hidden',
            maxHeight: isReposOpen ? 9999 : 0,
            opacity: isReposOpen ? 1 : 0,
            transition: 'max-height 0.3s ease, opacity 0.2s ease',
            marginTop: isReposOpen ? 12 : 0,
          }}>
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
                  background: 'var(--bg-secondary)',
                  border: `1px solid ${colors.border}`,
                  borderRadius: 8,
                  maxHeight: 220,
                  overflowY: 'auto',
                  zIndex: 10,
                  boxShadow: '0 8px 32px var(--shadow-dropdown)',
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
                      (e.target as HTMLElement).style.background = 'var(--accent-10)';
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
                  background: 'var(--bg-secondary)',
                  border: `1px solid ${colors.border}`,
                  borderRadius: 8,
                  padding: '12px',
                  fontSize: 13,
                  color: colors.textSecondary,
                  boxShadow: '0 8px 32px var(--shadow-dropdown)',
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
        </div>
      </section>

      {/* Divider */}
      <div style={{ borderTop: '1px solid var(--border-subtle)', margin: '20px 0' }} />

      {/* ── Theme ── */}
      {onChangeTheme && (
        <section style={{ marginBottom: 0 }}>
          <SectionHeader
            title="Theme"
            status={theme === 'default' ? 'Default' : (availableThemes ?? []).find(t => t.id === theme)?.label}
            open={themeOpen}
            onToggle={() => setThemeOpen(o => !o)}
          />
          <div
            style={{
              overflow: 'hidden',
              maxHeight: themeOpen ? 500 : 0,
              opacity: themeOpen ? 1 : 0,
              transition: 'max-height 0.3s ease, opacity 0.2s ease',
              marginTop: themeOpen ? 12 : 0,
            }}>
            {/* Active theme selector — only shows if themes are unlocked */}
            {(availableThemes ?? []).length > 1 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, color: colors.textSecondary, marginBottom: 6 }}>Active theme</div>
                <select
                  value={theme || 'default'}
                  onChange={e => onChangeTheme(e.target.value as ThemeId)}
                  style={{
                    width: '100%',
                    background: colors.inputBg,
                    color: colors.textPrimary,
                    border: `1px solid ${colors.border}`,
                    borderRadius: 8,
                    padding: '10px 14px',
                    fontSize: 14,
                    cursor: 'pointer',
                    outline: 'none',
                    appearance: 'none',
                    WebkitAppearance: 'none',
                    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath d='M3 4.5L6 7.5L9 4.5' fill='none' stroke='%2394a3b8' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'right 12px center',
                    paddingRight: 32,
                    boxSizing: 'border-box' as const,
                    fontFamily: 'var(--font-body)',
                    transition: 'all 0.15s',
                  }}>
                  {(availableThemes ?? []).map(t => (
                    <option key={t.id} value={t.id} style={{ background: 'var(--bg-secondary)' }}>
                      {t.label}
                      {t.id === 'default' ? ' (Default)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Activation code input */}
            <p style={{ margin: '0 0 12px', color: colors.textSecondary, fontSize: 13, lineHeight: 1.5 }}>
              Enter a magic code to unlock a custom branded theme.
            </p>
            <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
              <input
                type="text"
                placeholder="Enter activation code"
                value={activationCode}
                onChange={e => {
                  setActivationCode(e.target.value);
                  if (activationStatus !== 'idle') setActivationStatus('idle');
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter' && activationCode.trim() && onActivateCode) {
                    const result = onActivateCode(activationCode);
                    if (result.success) {
                      setActivationStatus(result.alreadyUnlocked ? 'already' : 'success');
                      setActivatedThemeName(result.theme?.label ?? '');
                      setActivationCode('');
                    } else {
                      setActivationStatus('error');
                    }
                  }
                }}
                style={{
                  ...inputStyle,
                }}
              />
              <button
                onClick={() => {
                  if (!activationCode.trim() || !onActivateCode) return;
                  const result = onActivateCode(activationCode);
                  if (result.success) {
                    setActivationStatus(result.alreadyUnlocked ? 'already' : 'success');
                    setActivatedThemeName(result.theme?.label ?? '');
                    setActivationCode('');
                  } else {
                    setActivationStatus('error');
                  }
                }}
                disabled={!activationCode.trim()}
                style={!activationCode.trim() ? buttonDisabledStyle : buttonStyle}>
                Activate
              </button>
            </div>

            {/* Feedback messages */}
            {activationStatus === 'success' && (
              <div
                style={{
                  marginTop: 10,
                  padding: '8px 12px',
                  background: 'var(--success-10)',
                  border: '1px solid var(--success-20)',
                  borderRadius: 8,
                  fontSize: 13,
                  color: 'var(--status-success)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M5 13l4 4L19 7"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <strong>{activatedThemeName}</strong>&nbsp;unlocked and activated!
              </div>
            )}
            {activationStatus === 'already' && (
              <div
                style={{
                  marginTop: 10,
                  padding: '8px 12px',
                  background: 'var(--accent-10)',
                  border: '1px solid var(--accent-20)',
                  borderRadius: 8,
                  fontSize: 13,
                  color: colors.textSecondary,
                }}>
                <strong>{activatedThemeName}</strong> is already unlocked. Switched!
              </div>
            )}
            {activationStatus === 'error' && (
              <div
                style={{
                  marginTop: 10,
                  padding: '8px 12px',
                  background: 'var(--error-10)',
                  border: '1px solid var(--error-30)',
                  borderRadius: 8,
                  fontSize: 13,
                  color: 'var(--status-error)',
                }}>
                Invalid code. Double-check and try again.
              </div>
            )}

            {/* Want your own theme? */}
            <div style={{ marginTop: 16, borderTop: '1px solid var(--border-subtle)', paddingTop: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: colors.textPrimary, marginBottom: 4 }}>
                Want your own branded theme?
              </div>
              <p style={{ margin: '0 0 12px', fontSize: 12, color: colors.textSecondary, lineHeight: 1.6 }}>
                Share Visual Issue Reporter and we&apos;ll create a custom theme with your brand colors, fonts, and logo
                — completely free.
              </p>

              {/* Social share buttons — 2x2 grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {/* X / Twitter */}
                <a
                  className="hover-card"
                  href="https://x.com/intent/tweet?text=Just%20discovered%20Visual%20Issue%20Reporter%20%E2%80%94%20a%20Chrome%20extension%20for%20visual%20bug%20reporting%20with%20Claude%20Code%20auto-fix.%20Super%20useful%20for%20dev%20teams!&url=https%3A%2F%2Fgithub.com%2FN-O-P-E%2Fvisual-issue-reporter"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '10px 12px',
                    borderRadius: 8,
                    background: 'var(--bg-input)',
                    border: '1px solid var(--border-default)',
                    color: colors.textPrimary,
                    fontSize: 12,
                    fontWeight: 500,
                    textDecoration: 'none',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }}>
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                  </svg>
                  Post on X
                </a>

                {/* Reddit */}
                <a
                  className="hover-card"
                  href="https://www.reddit.com/submit?url=https%3A%2F%2Fgithub.com%2FN-O-P-E%2Fvisual-issue-reporter&title=Visual%20Issue%20Reporter%20%E2%80%94%20Chrome%20extension%20for%20visual%20bug%20reporting%20with%20Claude%20Code%20auto-fix.%20Super%20useful%20for%20dev%20teams!"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '10px 12px',
                    borderRadius: 8,
                    background: 'var(--bg-input)',
                    border: '1px solid var(--border-default)',
                    color: colors.textPrimary,
                    fontSize: 12,
                    fontWeight: 500,
                    textDecoration: 'none',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }}>
                    <path d="M8.30347 11.5753C7.51878 11.5753 6.84378 12.3553 6.79691 13.3715C6.75003 14.3878 7.43722 14.8012 8.22285 14.8012C9.00847 14.8012 9.59441 14.4319 9.64128 13.4156C9.68816 12.3994 9.08816 11.5753 8.30347 11.5753Z" />
                    <path d="M17.2153 13.3715C17.1694 12.3553 16.4944 11.5753 15.7088 11.5753C14.9232 11.5753 14.3241 12.3994 14.371 13.4156C14.4178 14.4328 15.0047 14.8012 15.7894 14.8012C16.5741 14.8012 17.2622 14.3878 17.2153 13.3715Z" />
                    <path d="M14.9588 16.0275C15.016 15.8906 14.9222 15.7378 14.775 15.7228C13.9116 15.6356 12.9797 15.5878 12.0057 15.5878C11.0316 15.5878 10.0988 15.6356 9.23628 15.7228C9.0891 15.7378 8.99535 15.8906 9.05253 16.0275C9.53628 17.1815 10.6753 17.9925 12.0057 17.9925C13.336 17.9925 14.476 17.1815 14.9588 16.0275Z" />
                    <path
                      fillRule="evenodd"
                      clipRule="evenodd"
                      d="M0 12C0 5.37281 5.37281 0 12 0C18.6272 0 24 5.37281 24 12C24 18.6272 18.6272 24 12 24H1.73813C1.09688 24 0.775312 23.2247 1.22906 22.7709L3.51469 20.4853C1.34344 18.3141 0 15.3141 0 12ZM16.3875 7.19811C15.4416 7.19811 14.6494 6.54092 14.4413 5.65873V5.66061C13.2938 5.82279 12.4088 6.81092 12.4088 8.00154V8.00904C14.1853 8.07561 15.8091 8.57623 17.0953 9.37217C17.5678 9.00842 18.1594 8.79186 18.8016 8.79186C20.3494 8.79186 21.6038 10.0462 21.6038 11.594C21.6038 12.7106 20.9494 13.6753 20.0035 14.1253C19.9153 17.3812 16.366 20.0006 12.0057 20.0006C7.64535 20.0006 4.10066 17.384 4.00785 14.1309C3.05441 13.6837 2.39441 12.7162 2.39441 11.5931C2.39441 10.0453 3.64878 8.79092 5.1966 8.79092C5.8416 8.79092 6.43597 9.00936 6.90941 9.37592C8.18441 8.58561 9.79035 8.08498 11.5491 8.01092V8.00061C11.5491 6.33842 12.8119 4.96686 14.4291 4.79342C14.6166 3.88311 15.4219 3.19873 16.3875 3.19873C17.4919 3.19873 18.3872 4.09404 18.3872 5.19842C18.3872 6.30279 17.4919 7.19811 16.3875 7.19811Z"
                    />
                  </svg>
                  Share on Reddit
                </a>

                {/* GitHub Star */}
                <a
                  className="hover-card"
                  href="https://github.com/N-O-P-E/visual-issue-reporter"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '10px 12px',
                    borderRadius: 8,
                    background: 'var(--bg-input)',
                    border: '1px solid var(--border-default)',
                    color: colors.textPrimary,
                    fontSize: 12,
                    fontWeight: 500,
                    textDecoration: 'none',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }}>
                    <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
                  </svg>
                  Star on GitHub
                </a>

                {/* Email request */}
                <a
                  className="hover-card"
                  href="mailto:makemytheme@studionope.nl?subject=Custom%20theme%20request%20%E2%80%94%20Visual%20Issue%20Reporter&body=Hi!%20I%27d%20love%20a%20custom%20branded%20theme%20for%20Visual%20Issue%20Reporter.%0A%0ABrand%20name%3A%20%0AWebsite%3A%20%0A%0AThanks!"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '10px 12px',
                    borderRadius: 8,
                    background: 'var(--bg-input)',
                    border: '1px solid var(--border-default)',
                    color: colors.textPrimary,
                    fontSize: 12,
                    fontWeight: 500,
                    textDecoration: 'none',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}>
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ flexShrink: 0 }}>
                    <rect x="2" y="4" width="20" height="16" rx="2" />
                    <path d="M22 4L12 13 2 4" />
                  </svg>
                  Request via email
                </a>
              </div>

              <p style={{ margin: '10px 0 0', fontSize: 11, color: colors.textMuted, lineHeight: 1.5 }}>
                After sharing, email{' '}
                <a
                  href="mailto:makemytheme@studionope.nl"
                  style={{ color: 'var(--accent-link)', textDecoration: 'none' }}>
                  makemytheme@studionope.nl
                </a>{' '}
                with proof and your brand details. We&apos;ll send your activation code within 48 hours.
              </p>
            </div>
          </div>

          {/* Divider */}
          <div style={{ borderTop: '1px solid var(--border-subtle)', margin: '20px 0' }} />
        </section>
      )}

      {/* ── Auto-fix with Claude Code ── */}
      <section style={{ marginBottom: 0 }}>
        <SectionHeader
          title="Auto-fix with Claude Code"
          status={(() => {
            if (anthropicKeyStatus !== 'valid') return 'Not configured';
            if (repos.length === 0) return 'No repos';
            const readyCount = repos.filter(r => repoSecretStatus[r] === true && repoWorkflowStatus[r] === true).length;
            if (readyCount === repos.length) return 'Ready';
            if (readyCount > 0) return `${readyCount}/${repos.length} repos ready`;
            return 'Setup incomplete';
          })()}
          statusColor={(() => {
            if (anthropicKeyStatus !== 'valid') return colors.textMuted;
            if (repos.length === 0) return colors.textMuted;
            const readyCount = repos.filter(r => repoSecretStatus[r] === true && repoWorkflowStatus[r] === true).length;
            if (readyCount === repos.length) return colors.green;
            if (readyCount > 0) return 'var(--status-warning)';
            return 'var(--status-warning)';
          })()}
          open={isAutoFixOpen}
          onToggle={() => setAutoFixOpen(o => !o)}
        />
        <div
          style={{
            overflow: 'hidden',
            maxHeight: isAutoFixOpen ? 9999 : 0,
            opacity: isAutoFixOpen ? 1 : 0,
            transition: 'max-height 0.3s ease, opacity 0.2s ease',
            marginTop: isAutoFixOpen ? 12 : 0,
          }}>
          <p style={{ margin: '0 0 16px', color: colors.textSecondary, fontSize: 13, lineHeight: 1.5 }}>
            Let Claude Code automatically analyze reported issues and open a PR with the fix.
          </p>

          {/* Setup guide CTA — shown when not fully configured */}
          {anthropicKeyStatus !== 'valid' && (
            <button
              onClick={() => onOpenWizard?.(2)}
              style={{
                width: '100%',
                borderRadius: 10,
                border: 'none',
                background: 'var(--accent-gradient)',
                color: 'var(--text-on-accent)',
                fontSize: 14,
                fontWeight: 500,
                padding: '10px 18px',
                cursor: 'pointer',
                marginBottom: 16,
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.opacity = '0.9';
                e.currentTarget.style.transform = 'translateY(-1px)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.opacity = '1';
                e.currentTarget.style.transform = 'none';
              }}>
              Open setup guide
            </button>
          )}

          {/* ─ 1. Anthropic API Key ─ */}
          <div style={{ marginBottom: 16 }}>
            <span style={{ display: 'block', fontSize: 12, color: colors.textSecondary, marginBottom: 6 }}>
              Anthropic API Key{' '}
              {anthropicKeyStatus !== 'valid' && (
                <span>
                  — get yours from{' '}
                  <a
                    href="https://console.anthropic.com/settings/keys"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: 'var(--accent-link)' }}>
                    console.anthropic.com
                  </a>
                </span>
              )}
            </span>
            {anthropicKeyStatus !== 'valid' && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
                <input
                  type="password"
                  placeholder="sk-ant-..."
                  value={anthropicApiKey}
                  onChange={e => {
                    setAnthropicApiKey(e.target.value);
                    setAnthropicKeyStatus('idle');
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter') void validateAnthropicKey();
                  }}
                  style={inputStyle}
                />
                <button
                  style={
                    anthropicKeyStatus === 'validating' || !anthropicApiKey.trim() ? buttonDisabledStyle : buttonStyle
                  }
                  onClick={() => void validateAnthropicKey()}
                  disabled={anthropicKeyStatus === 'validating' || !anthropicApiKey.trim()}>
                  {anthropicKeyStatus === 'validating' ? '…' : 'Validate'}
                </button>
              </div>
            )}
            {anthropicKeyStatus === 'valid' && (
              <div
                style={{
                  marginTop: 8,
                  fontSize: 13,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}>
                <span style={{ color: colors.green, display: 'flex', alignItems: 'center', gap: 6 }}>
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
                  Connected
                </span>
                <button
                  onClick={disconnectAnthropicKey}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: colors.textMuted,
                    fontSize: 11,
                    cursor: 'pointer',
                    padding: '2px 6px',
                    textDecoration: 'underline',
                    transition: 'all 0.15s',
                  }}>
                  Disconnect
                </button>
              </div>
            )}
            {anthropicKeyStatus === 'invalid' && (
              <div style={{ marginTop: 8, fontSize: 13, color: colors.error }}>
                Invalid API key — check and try again.
              </div>
            )}
          </div>

          {/* ─ 2. Model picker (only when key is valid) ─ */}
          {anthropicKeyStatus === 'valid' && (
            <div style={{ marginBottom: 16 }}>
              <span style={{ display: 'block', fontSize: 12, color: colors.textSecondary, marginBottom: 6 }}>
                Model
              </span>
              <div style={{ display: 'flex', gap: 4 }}>
                {MODELS.map(m => (
                  <button
                    className="hover-card"
                    key={m.id}
                    onClick={() => {
                      setSelectedModel(m.id);
                      setTimeout(saveAutoFixSettings, 0);
                    }}
                    style={{
                      flex: 1,
                      padding: '8px 6px',
                      borderRadius: 8,
                      border: `1px solid ${selectedModel === m.id ? 'var(--accent-20)' : colors.border}`,
                      background: selectedModel === m.id ? 'var(--accent-10)' : colors.inputBg,
                      color: selectedModel === m.id ? 'var(--text-primary)' : colors.textSecondary,
                      fontSize: 11,
                      fontWeight: selectedModel === m.id ? 600 : 400,
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                      textAlign: 'center',
                      lineHeight: 1.3,
                    }}>
                    <div>{m.label.replace('Claude ', '')}</div>
                    <div style={{ fontSize: 9, opacity: 0.7, marginTop: 2 }}>{m.desc}</div>
                  </button>
                ))}
              </div>
              <p style={{ margin: '6px 0 0', fontSize: 11, color: colors.textMuted, lineHeight: 1.5 }}>
                Override any time via repo Settings → Variables:{' '}
                <code
                  style={{
                    fontFamily: 'monospace',
                    fontSize: 10,
                    background: colors.inputBg,
                    border: `1px solid ${colors.border}`,
                    borderRadius: 3,
                    padding: '1px 4px',
                  }}>
                  CLAUDE_MODEL
                </code>{' '}
                (primary) ·{' '}
                <code
                  style={{
                    fontFamily: 'monospace',
                    fontSize: 10,
                    background: colors.inputBg,
                    border: `1px solid ${colors.border}`,
                    borderRadius: 3,
                    padding: '1px 4px',
                  }}>
                  CLAUDE_FALLBACK_MODEL
                </code>{' '}
                (used when primary is overloaded, defaults to Haiku 4.5).
              </p>
            </div>
          )}

          {/* ─ 3. Auto-fix by default toggle (only when key is valid) ─ */}
          {anthropicKeyStatus === 'valid' && (
            <div
              style={{
                marginBottom: 16,
                padding: '12px 14px',
                background: colors.inputBg,
                border: `1px solid ${colors.border}`,
                borderRadius: 8,
              }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: colors.textPrimary }}>
                    Enable auto-fix by default
                  </div>
                  <div style={{ fontSize: 11, color: colors.textSecondary, marginTop: 3, lineHeight: 1.4 }}>
                    Pre-enable the auto-fix toggle when creating issues. Each fix uses tokens on your Anthropic API key.
                  </div>
                </div>
                {/* Toggle switch */}
                {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
                <div
                  onClick={() => {
                    const newVal = !autoFixByDefault;
                    setAutoFixByDefault(newVal);
                    // Save directly with the new value to avoid stale closure
                    const settings: AutoFixSettings = {
                      enabled: !!anthropicApiKey.trim(),
                      anthropicApiKey: anthropicApiKey || undefined,
                      systemPrompt: systemPrompt !== DEFAULT_SYSTEM_PROMPT ? systemPrompt : undefined,
                      model: selectedModel !== DEFAULT_MODEL ? selectedModel : undefined,
                      autoFixByDefault: newVal || undefined,
                    };
                    chrome.storage.local.set({ autoFixSettings: settings });
                  }}
                  style={{
                    position: 'relative',
                    width: 36,
                    height: 20,
                    borderRadius: 10,
                    background: autoFixByDefault ? 'var(--accent-hover)' : 'var(--border-default)',
                    transition: 'background 0.2s',
                    cursor: 'pointer',
                    flexShrink: 0,
                  }}>
                  <div
                    style={{
                      position: 'absolute',
                      top: 2,
                      left: autoFixByDefault ? 18 : 2,
                      width: 16,
                      height: 16,
                      borderRadius: '50%',
                      background: 'var(--text-on-accent)',
                      transition: 'left 0.2s ease',
                      boxShadow: '0 1px 3px var(--shadow-dropdown)',
                    }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* ─ 4. Per-repo setup (only when key is valid) ─ */}
          {anthropicKeyStatus === 'valid' && repos.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <span style={{ display: 'block', fontSize: 12, color: colors.textSecondary, marginBottom: 8 }}>
                Repository setup
              </span>

              {/* Copy buttons row */}
              <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                <button
                  className="hover-card"
                  onClick={() => {
                    navigator.clipboard.writeText(anthropicApiKey);
                    setKeyCopied(true);
                    setTimeout(() => setKeyCopied(false), 2000);
                  }}
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 5,
                    background: keyCopied ? 'var(--success-20)' : colors.inputBg,
                    border: `1px solid ${keyCopied ? 'var(--status-success)' : colors.border}`,
                    borderRadius: 8,
                    padding: '8px 10px',
                    fontSize: 11,
                    fontWeight: 500,
                    color: keyCopied ? colors.green : colors.textPrimary,
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}>
                  {keyCopied ? (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                      <path
                        d="M5 13l4 4L19 7"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  ) : (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                      <path
                        d="M8 4H6a2 2 0 00-2 2v12a2 2 0 002 2h8a2 2 0 002-2v-2M8 4v2a2 2 0 002 2h4M8 4a2 2 0 012-2h3.17a2 2 0 011.41.59l4.83 4.83A2 2 0 0120 8.83V14a2 2 0 01-2 2h-2m0 0H10a2 2 0 01-2-2V8"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                      />
                    </svg>
                  )}
                  {keyCopied ? 'Copied!' : 'Copy API key'}
                </button>
                <button
                  className="hover-card"
                  onClick={() => {
                    const yaml = buildWorkflowYaml(systemPrompt, selectedModel);
                    navigator.clipboard.writeText(yaml);
                    const snapshot = { model: selectedModel, systemPrompt };
                    setLastCopiedSnapshot(snapshot);
                    chrome.storage.local.set({ yamlCopiedSnapshot: snapshot });
                    setYamlCopied(true);
                    setTimeout(() => setYamlCopied(false), 2000);
                  }}
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 5,
                    background: yamlCopied
                      ? 'var(--success-20)'
                      : isYamlStale
                        ? 'rgba(245,158,11,0.08)'
                        : colors.inputBg,
                    border: `1px solid ${yamlCopied ? 'var(--status-success)' : isYamlStale ? 'var(--status-warning)' : colors.border}`,
                    borderRadius: 8,
                    padding: '8px 10px',
                    fontSize: 11,
                    fontWeight: isYamlStale ? 600 : 500,
                    color: yamlCopied ? colors.green : isYamlStale ? 'var(--status-warning)' : colors.textPrimary,
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}>
                  {yamlCopied ? (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                      <path
                        d="M5 13l4 4L19 7"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  ) : isYamlStale ? (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                      <path
                        d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  ) : (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                      <path
                        d="M8 4H6a2 2 0 00-2 2v12a2 2 0 002 2h8a2 2 0 002-2v-2M8 4v2a2 2 0 002 2h4M8 4a2 2 0 012-2h3.17a2 2 0 011.41.59l4.83 4.83A2 2 0 0120 8.83V14a2 2 0 01-2 2h-2m0 0H10a2 2 0 01-2-2V8"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                      />
                    </svg>
                  )}
                  {yamlCopied ? 'Copied!' : isYamlStale ? 'Re-copy workflow YAML' : 'Copy workflow YAML'}
                </button>
              </div>

              {/* Stale YAML warning */}
              {isYamlStale && (
                <div
                  style={{
                    marginTop: 8,
                    padding: '8px 12px',
                    background: 'rgba(245,158,11,0.08)',
                    border: '1px solid rgba(245,158,11,0.3)',
                    borderRadius: 7,
                    fontSize: 11,
                    color: 'var(--status-warning)',
                    lineHeight: 1.5,
                    display: 'flex',
                    gap: 8,
                    alignItems: 'flex-start',
                  }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, marginTop: 1 }}>
                    <path
                      d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <span>
                    {lastCopiedSnapshot?.model !== selectedModel && lastCopiedSnapshot?.systemPrompt !== systemPrompt
                      ? 'Model and system prompt changed'
                      : lastCopiedSnapshot?.model !== selectedModel
                        ? 'Model changed'
                        : 'System prompt changed'}
                    {' — re-copy and commit the workflow file.'}
                  </span>
                </div>
              )}

              {/* Repo checklist */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {repos.map(repo => {
                  const hasSecret = repoSecretStatus[repo];
                  const hasWorkflow = repoWorkflowStatus[repo];
                  const allReady = hasSecret === true && hasWorkflow === true;
                  return (
                    <div
                      key={repo}
                      style={{
                        padding: '8px 10px',
                        background: colors.inputBg,
                        border: `1px solid ${allReady ? 'var(--success-20)' : colors.border}`,
                        borderRadius: 6,
                        fontSize: 12,
                        transition: 'all 0.15s',
                      }}>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          color: colors.textPrimary,
                          marginBottom: allReady ? 0 : 6,
                        }}>
                        <span
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: '50%',
                            flexShrink: 0,
                            background: allReady ? colors.green : hasSecret === null ? colors.textMuted : colors.error,
                          }}
                        />
                        <span
                          style={{
                            flex: 1,
                            minWidth: 0,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}>
                          {repo}
                        </span>
                        {allReady && <span style={{ color: colors.green, fontSize: 11, flexShrink: 0 }}>Ready</span>}
                        {hasSecret === null && hasWorkflow === null && (
                          <span style={{ color: colors.textMuted, fontSize: 11, flexShrink: 0 }}>Checking…</span>
                        )}
                      </div>
                      {!allReady && (hasSecret !== null || hasWorkflow !== null) && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, paddingLeft: 12 }}>
                          {/* Secret row */}
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              fontSize: 11,
                            }}>
                            <span style={{ color: hasSecret === true ? colors.green : colors.textSecondary }}>
                              {hasSecret === true ? '✓' : '○'} ANTHROPIC_API_KEY secret
                            </span>
                            {hasSecret === false && (
                              <a
                                href={`https://github.com/${repo}/settings/secrets/actions/new?secret_name=ANTHROPIC_API_KEY`}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                  fontSize: 10,
                                  color: 'var(--accent-link)',
                                  textDecoration: 'underline',
                                  cursor: 'pointer',
                                }}>
                                Add →
                              </a>
                            )}
                          </div>
                          {/* Workflow row */}
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              fontSize: 11,
                            }}>
                            <span style={{ color: hasWorkflow === true ? colors.green : colors.textSecondary }}>
                              {hasWorkflow === true ? '✓' : '○'} Workflow file
                            </span>
                            {hasWorkflow === false && (
                              <a
                                href={`https://github.com/${repo}/new/main?filename=.github/workflows/visual-issue-claude-fix.yml`}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                  fontSize: 10,
                                  color: 'var(--accent-link)',
                                  textDecoration: 'underline',
                                  cursor: 'pointer',
                                }}>
                                Add →
                              </a>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
                <button
                  onClick={recheckRepos}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: colors.textMuted,
                    fontSize: 11,
                    cursor: 'pointer',
                    padding: '4px 0 0',
                    textDecoration: 'underline',
                    textAlign: 'left',
                    transition: 'all 0.15s',
                  }}>
                  Re-check repos
                </button>
              </div>
              <p style={{ margin: '8px 0 0', fontSize: 11, color: colors.textMuted, lineHeight: 1.5 }}>
                Each repo needs the API key as a secret and a workflow file. Copy above, then use the "Add →" links.
              </p>
            </div>
          )}

          {anthropicKeyStatus === 'valid' && repos.length === 0 && (
            <p style={{ margin: '0 0 16px', fontSize: 12, color: colors.textMuted }}>
              Add repositories above first to configure auto-fix per repo.
            </p>
          )}

          {/* ─ 3. System Prompt ─ */}
          {anthropicKeyStatus === 'valid' && (
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block' }}>
                <span style={{ display: 'block', fontSize: 12, color: colors.textSecondary, marginBottom: 6 }}>
                  System Prompt
                </span>
                <textarea
                  value={systemPrompt}
                  onChange={e => setSystemPrompt(e.target.value)}
                  onBlur={saveAutoFixSettings}
                  placeholder="Instructions for Claude when fixing issues..."
                  style={{
                    width: '100%',
                    minHeight: 180,
                    background: colors.inputBg,
                    border: `1px solid ${colors.border}`,
                    borderRadius: 8,
                    padding: '10px 14px',
                    color: colors.textPrimary,
                    fontSize: 12,
                    fontFamily: 'inherit',
                    lineHeight: 1.5,
                    outline: 'none',
                    resize: 'vertical',
                    boxSizing: 'border-box',
                    transition: 'all 0.15s',
                  }}
                />
              </label>
              <button
                onClick={() => {
                  setSystemPrompt(DEFAULT_SYSTEM_PROMPT);
                  setTimeout(saveAutoFixSettings, 0);
                }}
                style={{
                  marginTop: 6,
                  background: 'none',
                  border: 'none',
                  color: colors.textMuted,
                  fontSize: 11,
                  cursor: 'pointer',
                  padding: 0,
                  textDecoration: 'underline',
                }}>
                Reset to default
              </button>
            </div>
          )}

          {/* Setup guide button when connected */}
          {anthropicKeyStatus === 'valid' && (
            <button
              onClick={() => onOpenWizard?.(2)}
              style={{
                width: '100%',
                borderRadius: 10,
                border: `1px solid var(--border-default)`,
                background: 'var(--bg-input-hover)',
                color: 'var(--text-secondary)',
                fontSize: 13,
                fontWeight: 500,
                padding: '10px 18px',
                cursor: 'pointer',
                transition: 'all 0.15s',
                marginTop: 4,
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = 'var(--border-default)';
                e.currentTarget.style.color = 'var(--text-primary)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = 'var(--border-default)';
                e.currentTarget.style.color = 'var(--text-secondary)';
              }}>
              Re-run setup guide
            </button>
          )}
        </div>
      </section>

      {/* Divider */}
      <div style={{ borderTop: '1px solid var(--border-subtle)', margin: '20px 0' }} />

      {/* ── Contribute ── */}
      <section style={{ marginBottom: 24 }}>
        <SectionHeader title="Contribute" open={contributeOpen} onToggle={() => setContributeOpen(o => !o)} />
        <div
          style={{
            overflow: 'hidden',
            maxHeight: contributeOpen ? 400 : 0,
            opacity: contributeOpen ? 1 : 0,
            transition: 'max-height 0.3s ease, opacity 0.2s ease',
            marginTop: contributeOpen ? 12 : 0,
          }}>
          <p style={{ margin: '0 0 12px', color: colors.textSecondary, fontSize: 13, lineHeight: 1.5 }}>
            This tool is open source. Help make it better — suggest ideas, report bugs, or contribute code.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <a
              href="https://github.com/N-O-P-E/visual-issue-reporter/issues"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                flex: 1,
                padding: '9px 12px',
                background: colors.inputBg,
                border: `1px solid ${colors.border}`,
                borderRadius: 8,
                color: colors.textPrimary,
                fontSize: 13,
                textDecoration: 'none',
                textAlign: 'center' as const,
                transition: 'all 0.15s',
              }}>
              Suggest a feature
            </a>
            <a
              href="https://github.com/N-O-P-E/visual-issue-reporter"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                flex: 1,
                padding: '9px 12px',
                background: colors.inputBg,
                border: `1px solid ${colors.border}`,
                borderRadius: 8,
                color: colors.textPrimary,
                fontSize: 13,
                textDecoration: 'none',
                textAlign: 'center' as const,
                transition: 'all 0.15s',
              }}>
              View on GitHub
            </a>
          </div>
        </div>
      </section>

      {/* Saved toast */}
      {saved && (
        <div
          style={{
            position: 'fixed',
            bottom: 24,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'var(--bg-secondary)',
            border: `1px solid ${colors.border}`,
            borderRadius: 8,
            padding: '8px 18px',
            fontSize: 13,
            color: colors.green,
            boxShadow: '0 4px 24px var(--shadow-dropdown)',
            whiteSpace: 'nowrap',
          }}>
          Saved
        </div>
      )}
    </div>
  );
}
