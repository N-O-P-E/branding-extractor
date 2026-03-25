import { useState, useEffect, useCallback } from 'react';
import type { AutoFixSettings } from '@extension/shared';

interface SetupViewProps {
  onDone: () => void;
  openSection?: string;
  onOpenWizard?: (chapter: 1 | 2) => void;
}

const colors = {
  bg: '#0f172a',
  textPrimary: '#f1f5f9',
  textSecondary: 'rgba(241,245,249,0.45)',
  textMuted: 'rgba(241,245,249,0.3)',
  purpleAccent: '#a78bfa',
  green: '#4ade80',
  inputBg: 'rgba(148,163,184,0.08)',
  border: 'rgba(148,163,184,0.15)',
  error: '#f87171',
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
        uses: anthropics/claude-code-action@v1
        with:
          anthropic_api_key: \${{ secrets.ANTHROPIC_API_KEY }}
          label_trigger: "auto-fix"
          claude_args: |
            --model ${model}
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
    <h2 style={{ fontSize: 18, margin: 0, color: colors.purpleAccent }}>{title}</h2>
    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      {status && (
        <span style={{ fontSize: 12, color: statusColor ?? colors.textSecondary, fontWeight: 400 }}>{status}</span>
      )}
      <Chevron open={open} />
    </span>
  </button>
);

export default function SetupView({ onDone, openSection, onOpenWizard }: SetupViewProps) {
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

  // Accordion open state — null means "use smart defaults" (set after load)
  const [tokenOpen, setTokenOpen] = useState<boolean | null>(null);
  const [reposOpen, setReposOpen] = useState<boolean | null>(null);
  const [autoFixOpen, setAutoFixOpen] = useState<boolean | null>(null);
  const [contributeOpen, setContributeOpen] = useState(false);
  const [keyCopied, setKeyCopied] = useState(false);
  const [yamlCopied, setYamlCopied] = useState(false);

  useEffect(() => {
    // Check token status via background — never read the raw PAT
    chrome.runtime.sendMessage({ type: 'CHECK_TOKEN_STATUS' }, (response: { connected: boolean; login?: string }) => {
      if (response?.connected) {
        setPatStatus('valid');
        if (response.login) setPatUser(response.login);
        setTokenOpen(openSection === 'token' ? true : false);
      } else {
        setTokenOpen(true);
      }
    });
    chrome.storage.local.get(['repoList']).then(result => {
      if (result.repoList) {
        const list = result.repoList as string[];
        setRepos(list);
        setReposOpen(openSection === 'repos' ? true : list.length === 0);
      } else {
        setReposOpen(true);
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
        setAutoFixOpen(openSection === 'autofix' ? true : !settings.anthropicApiKey);
      } else {
        setAutoFixOpen(true);
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
    };
    chrome.storage.local.set({ autoFixSettings: settings });
    flashSaved();
  }, [anthropicApiKey, systemPrompt, selectedModel]);

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
    background: 'linear-gradient(135deg, #7c3aed, #9333ea)',
    border: 'none',
    borderRadius: 10,
    padding: '10px 18px',
    color: '#fff',
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
            onClick={onDone}
            aria-label="Back"
            style={{
              background: 'rgba(148,163,184,0.08)',
              border: '1px solid rgba(148,163,184,0.12)',
              borderRadius: 8,
              width: 32,
              height: 32,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: 'rgba(241,245,249,0.6)',
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
              style={{ color: '#c4b5fd' }}>
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
      <div style={{ borderTop: '1px solid rgba(148,163,184,0.1)', margin: '20px 0' }} />

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
                  background: '#1e293b',
                  border: `1px solid ${colors.border}`,
                  borderRadius: 8,
                  maxHeight: 220,
                  overflowY: 'auto',
                  zIndex: 10,
                  boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
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
                      (e.target as HTMLElement).style.background = 'rgba(139,92,246,0.1)';
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
                  background: '#1e293b',
                  border: `1px solid ${colors.border}`,
                  borderRadius: 8,
                  padding: '12px',
                  fontSize: 13,
                  color: colors.textSecondary,
                  boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
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
      <div style={{ borderTop: '1px solid rgba(148,163,184,0.1)', margin: '20px 0' }} />

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
            if (readyCount > 0) return '#F59E0B';
            return '#F59E0B';
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
                background: 'linear-gradient(135deg, #7c3aed, #9333ea)',
                color: '#ffffff',
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
                    style={{ color: '#c4b5fd' }}>
                    console.anthropic.com
                  </a>
                </span>
              )}
            </span>
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
                    key={m.id}
                    onClick={() => {
                      setSelectedModel(m.id);
                      setTimeout(saveAutoFixSettings, 0);
                    }}
                    style={{
                      flex: 1,
                      padding: '8px 6px',
                      borderRadius: 8,
                      border: `1px solid ${selectedModel === m.id ? '#a78bfa' : colors.border}`,
                      background: selectedModel === m.id ? 'rgba(167,139,250,0.1)' : colors.inputBg,
                      color: selectedModel === m.id ? '#a78bfa' : colors.textSecondary,
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
            </div>
          )}

          {/* ─ 3. Per-repo setup (only when key is valid) ─ */}
          {anthropicKeyStatus === 'valid' && repos.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <span style={{ display: 'block', fontSize: 12, color: colors.textSecondary, marginBottom: 8 }}>
                Repository setup
              </span>

              {/* Copy buttons row */}
              <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                <button
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
                    background: keyCopied ? 'rgba(74,222,128,0.08)' : colors.inputBg,
                    border: `1px solid ${keyCopied ? 'rgba(74,222,128,0.25)' : colors.border}`,
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
                  onClick={() => {
                    const yaml = buildWorkflowYaml(systemPrompt, selectedModel);
                    navigator.clipboard.writeText(yaml);
                    setYamlCopied(true);
                    setTimeout(() => setYamlCopied(false), 2000);
                  }}
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 5,
                    background: yamlCopied ? 'rgba(74,222,128,0.08)' : colors.inputBg,
                    border: `1px solid ${yamlCopied ? 'rgba(74,222,128,0.25)' : colors.border}`,
                    borderRadius: 8,
                    padding: '8px 10px',
                    fontSize: 11,
                    fontWeight: 500,
                    color: yamlCopied ? colors.green : colors.textPrimary,
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
                  {yamlCopied ? 'Copied!' : 'Copy workflow YAML'}
                </button>
              </div>

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
                        border: `1px solid ${allReady ? 'rgba(74,222,128,0.2)' : colors.border}`,
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
                        {allReady && (
                          <a
                            href={`https://github.com/${repo}/blob/main/.github/workflows/visual-issue-claude-fix.yml`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              color: colors.green,
                              fontSize: 11,
                              flexShrink: 0,
                              textDecoration: 'none',
                              cursor: 'pointer',
                            }}
                            onMouseEnter={e => {
                              e.currentTarget.style.textDecoration = 'underline';
                            }}
                            onMouseLeave={e => {
                              e.currentTarget.style.textDecoration = 'none';
                            }}>
                            Ready →
                          </a>
                        )}
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
                                  color: '#c4b5fd',
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
                                  color: '#c4b5fd',
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
                border: `1px solid rgba(148,163,184,0.15)`,
                background: 'rgba(148,163,184,0.06)',
                color: 'rgba(241,245,249,0.6)',
                fontSize: 13,
                fontWeight: 500,
                padding: '10px 18px',
                cursor: 'pointer',
                transition: 'all 0.15s',
                marginTop: 4,
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = 'rgba(148,163,184,0.25)';
                e.currentTarget.style.color = '#f1f5f9';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = 'rgba(148,163,184,0.15)';
                e.currentTarget.style.color = 'rgba(241,245,249,0.6)';
              }}>
              Re-run setup guide
            </button>
          )}
        </div>
      </section>

      {/* Divider */}
      <div style={{ borderTop: '1px solid rgba(148,163,184,0.1)', margin: '20px 0' }} />

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
            background: 'rgba(30,41,59,0.96)',
            border: `1px solid ${colors.border}`,
            borderRadius: 8,
            padding: '8px 18px',
            fontSize: 13,
            color: colors.green,
            boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
            whiteSpace: 'nowrap',
          }}>
          Saved
        </div>
      )}
    </div>
  );
}
