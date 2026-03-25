import onboardingHero from '../assets/onboarding-hero.jpg';
import { useState, useEffect, useCallback, useRef } from 'react';

interface OnboardingWizardProps {
  open: boolean;
  chapter: 1 | 2;
  onClose: () => void;
}

interface OnboardingProgress {
  chapter1Complete: boolean;
  chapter2Complete: boolean;
  lastStep: number;
}

const TOTAL_STEPS = 8;
const CHAPTER_2_START = 5;

const STORAGE_KEY = 'onboardingProgress';

const getInitialStep = (chapter: 1 | 2): number => (chapter === 1 ? 1 : CHAPTER_2_START);

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

const DEFAULT_MODEL = 'claude-sonnet-4-6';

const buildWorkflowYaml = (systemPrompt: string, model: string = DEFAULT_MODEL): string => {
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

const OnboardingWizard = ({ open, chapter, onClose }: OnboardingWizardProps) => {
  const [currentStep, setCurrentStep] = useState(() => getInitialStep(chapter));
  const [stepOpacity, setStepOpacity] = useState(1);
  const [initialized, setInitialized] = useState(false);

  // Step 2 state: GitHub token
  const [pat, setPat] = useState('');
  const [patStatus, setPatStatus] = useState<'idle' | 'validating' | 'success' | 'error'>('idle');
  const [patLogin, setPatLogin] = useState('');
  const [patError, setPatError] = useState('');

  // Step 5 state: Anthropic key
  const [anthropicApiKey, setAnthropicApiKey] = useState('');
  const [anthropicKeyStatus, setAnthropicKeyStatus] = useState<'idle' | 'validating' | 'success' | 'error'>('idle');
  const [anthropicKeyError, setAnthropicKeyError] = useState('');

  // Step 6 state: Repo secrets
  const [repoSecretStatus, setRepoSecretStatus] = useState<Record<string, 'checking' | 'exists' | 'missing'>>({});
  const [copiedApiKey, setCopiedApiKey] = useState(false);

  // Step 7 state: Repo workflows
  const [repoWorkflowStatus, setRepoWorkflowStatus] = useState<Record<string, 'checking' | 'exists' | 'missing'>>({});
  const [copiedYaml, setCopiedYaml] = useState(false);

  // System prompt and model for workflow YAML
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_SYSTEM_PROMPT);
  const [selectedModel, setSelectedModel] = useState(DEFAULT_MODEL);

  // Steps 6/7 shared: repo list from storage
  const [storedRepos, setStoredRepos] = useState<string[]>([]);

  // Step 3 state: Repos
  const [repos, setRepos] = useState<Array<{ full_name: string; description: string | null }>>([]);
  const [allRepos, setAllRepos] = useState<Array<{ full_name: string; description: string | null }>>([]);
  const [repoSearch, setRepoSearch] = useState('');
  const [repoDropdownOpen, setRepoDropdownOpen] = useState(false);
  const [reposFetched, setReposFetched] = useState(false);
  const repoInputRef = useRef<HTMLInputElement>(null);

  // On mount, read stored progress and pre-fill saved state
  useEffect(() => {
    chrome.storage.local.get(STORAGE_KEY, result => {
      const progress = result[STORAGE_KEY] as OnboardingProgress | undefined;
      if (progress) {
        const shouldResume =
          (chapter === 1 && !progress.chapter1Complete) || (chapter === 2 && !progress.chapter2Complete);
        if (shouldResume && progress.lastStep >= 1 && progress.lastStep <= TOTAL_STEPS) {
          const inChapter1 = progress.lastStep >= 1 && progress.lastStep <= 4;
          const inChapter2 = progress.lastStep >= CHAPTER_2_START && progress.lastStep <= TOTAL_STEPS;
          if ((chapter === 1 && inChapter1) || (chapter === 2 && inChapter2)) {
            setCurrentStep(progress.lastStep);
          }
        }
      }
      setInitialized(true);
    });

    // Pre-fill GitHub token status
    chrome.runtime.sendMessage({ type: 'CHECK_TOKEN_STATUS' }, (response: { connected: boolean; login?: string }) => {
      if (response?.connected) {
        setPatStatus('success');
        if (response.login) setPatLogin(response.login);
      }
    });

    // Pre-fill Anthropic key and system prompt from saved settings
    chrome.storage.local.get('autoFixSettings', result => {
      if (result.autoFixSettings?.anthropicApiKey) {
        setAnthropicApiKey(result.autoFixSettings.anthropicApiKey);
        setAnthropicKeyStatus('success');
      }
      if (result.autoFixSettings?.systemPrompt) {
        setSystemPrompt(result.autoFixSettings.systemPrompt);
      }
      if (result.autoFixSettings?.model) {
        setSelectedModel(result.autoFixSettings.model);
      }
    });

    // Pre-fill repos
    chrome.storage.local.get('repoList', result => {
      if (result.repoList) {
        const list = result.repoList as string[];
        setRepos(list.map(name => ({ full_name: name, description: null })));
        setStoredRepos(list);
      }
    });
  }, [chapter]);

  // Persist progress on step change
  useEffect(() => {
    if (!initialized) return;
    chrome.storage.local.get(STORAGE_KEY, result => {
      const prev = (result[STORAGE_KEY] as OnboardingProgress) || {
        chapter1Complete: false,
        chapter2Complete: false,
        lastStep: currentStep,
      };
      const updated: OnboardingProgress = {
        ...prev,
        lastStep: currentStep,
        chapter1Complete: prev.chapter1Complete || (chapter === 1 && currentStep === 4),
        chapter2Complete: prev.chapter2Complete || (chapter === 2 && currentStep === TOTAL_STEPS),
      };
      chrome.storage.local.set({ [STORAGE_KEY]: updated });
    });
  }, [currentStep, initialized, chapter]);

  const animateToStep = useCallback((step: number) => {
    setStepOpacity(0);
    const timeout = setTimeout(() => {
      setCurrentStep(step);
      setStepOpacity(1);
    }, 150);
    return () => clearTimeout(timeout);
  }, []);

  const handleNext = useCallback(() => {
    if (currentStep < TOTAL_STEPS) {
      animateToStep(currentStep + 1);
    }
  }, [currentStep, animateToStep]);

  const handleBack = useCallback(() => {
    if (chapter === 2 && currentStep === CHAPTER_2_START) {
      onClose();
      return;
    }
    const minStep = chapter === 2 ? CHAPTER_2_START : 1;
    if (currentStep > minStep) {
      animateToStep(currentStep - 1);
    }
  }, [currentStep, chapter, animateToStep, onClose]);

  // Step 2: Validate token
  const handleValidateToken = useCallback(() => {
    const trimmed = pat.trim();
    if (!trimmed) return;
    setPatStatus('validating');
    setPatError('');
    chrome.runtime.sendMessage({ type: 'VALIDATE_TOKEN', payload: { token: trimmed } }, response => {
      if (response?.success) {
        setPatStatus('success');
        setPatLogin(response.login || '');
      } else {
        setPatStatus('error');
        setPatError(response?.error || 'Validation failed');
      }
    });
  }, [pat]);

  // Step 3: Fetch repos
  const fetchRepos = useCallback(() => {
    if (reposFetched) return;
    chrome.runtime.sendMessage({ type: 'FETCH_REPOS' }, response => {
      if (response?.success && response.repos) {
        setAllRepos(response.repos);
        setReposFetched(true);
      }
    });
  }, [reposFetched]);

  const handleAddRepo = useCallback(
    (repo: { full_name: string; description: string | null }) => {
      const updated = [...repos, repo];
      setRepos(updated);
      setRepoSearch('');
      setRepoDropdownOpen(false);

      // Save to storage
      const repoList = updated.map(r => r.full_name);
      chrome.storage.local.set({ repoList });
      if (updated.length === 1) {
        chrome.storage.local.set({ selectedRepo: repo.full_name });
      }
    },
    [repos],
  );

  const handleRemoveRepo = useCallback(
    (fullName: string) => {
      const updated = repos.filter(r => r.full_name !== fullName);
      setRepos(updated);

      const repoList = updated.map(r => r.full_name);
      chrome.storage.local.set({ repoList });

      // If we removed the selected repo, select the first remaining one
      chrome.storage.local.get('selectedRepo', result => {
        if (result.selectedRepo === fullName) {
          chrome.storage.local.set({ selectedRepo: updated.length > 0 ? updated[0].full_name : '' });
        }
      });
    },
    [repos],
  );

  // Step 4: Save chapter1Complete and close
  const handleFinishChapter1 = useCallback(() => {
    chrome.storage.local.get(STORAGE_KEY, result => {
      const prev = (result[STORAGE_KEY] as OnboardingProgress) || {
        chapter1Complete: false,
        chapter2Complete: false,
        lastStep: currentStep,
      };
      chrome.storage.local.set({
        [STORAGE_KEY]: { ...prev, chapter1Complete: true },
      });
    });
  }, [currentStep]);

  // Step 5: Validate Anthropic key
  const handleValidateAnthropicKey = useCallback(() => {
    const trimmed = anthropicApiKey.trim();
    if (!trimmed) return;
    setAnthropicKeyStatus('validating');
    setAnthropicKeyError('');
    fetch('https://api.anthropic.com/v1/models', {
      headers: {
        'x-api-key': trimmed,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
    })
      .then(res => {
        if (res.ok) {
          setAnthropicKeyStatus('success');
          chrome.storage.local.set({ autoFixSettings: { enabled: true, anthropicApiKey: trimmed } });
        } else {
          setAnthropicKeyStatus('error');
          setAnthropicKeyError('Invalid API key');
        }
      })
      .catch(() => {
        setAnthropicKeyStatus('error');
        setAnthropicKeyError('Network error — check your connection');
      });
  }, [anthropicApiKey]);

  // Steps 6/7: Load repos from storage when reaching those steps
  useEffect(() => {
    if (currentStep === 6 || currentStep === 7) {
      chrome.storage.local.get('repoList', result => {
        const list = (result.repoList as string[]) ?? [];
        setStoredRepos(list);
      });
    }
  }, [currentStep]);

  // Step 6: Check secrets for all repos
  const checkAllSecrets = useCallback(() => {
    const init: Record<string, 'checking'> = {};
    storedRepos.forEach(repo => {
      init[repo] = 'checking';
    });
    setRepoSecretStatus(init);
    storedRepos.forEach(repo => {
      chrome.runtime.sendMessage(
        { type: 'CHECK_REPO_SECRET', payload: { repo, secretName: 'ANTHROPIC_API_KEY' } },
        response => {
          setRepoSecretStatus(prev => ({
            ...prev,
            [repo]: response?.success && response.exists ? 'exists' : 'missing',
          }));
        },
      );
    });
  }, [storedRepos]);

  useEffect(() => {
    if (currentStep === 6 && storedRepos.length > 0) {
      checkAllSecrets();
    }
  }, [currentStep, storedRepos, checkAllSecrets]);

  // Step 7: Check workflows for all repos
  const checkAllWorkflows = useCallback(() => {
    const init: Record<string, 'checking'> = {};
    storedRepos.forEach(repo => {
      init[repo] = 'checking';
    });
    setRepoWorkflowStatus(init);
    storedRepos.forEach(repo => {
      chrome.runtime.sendMessage({ type: 'CHECK_REPO_WORKFLOW', payload: { repo } }, response => {
        setRepoWorkflowStatus(prev => ({
          ...prev,
          [repo]: response?.success && response.exists ? 'exists' : 'missing',
        }));
      });
    });
  }, [storedRepos]);

  useEffect(() => {
    if (currentStep === 7 && storedRepos.length > 0) {
      checkAllWorkflows();
    }
  }, [currentStep, storedRepos, checkAllWorkflows]);

  // Step 8: Finish chapter 2
  const handleFinishChapter2 = useCallback(() => {
    chrome.storage.local.get(STORAGE_KEY, result => {
      const prev = (result[STORAGE_KEY] as OnboardingProgress) || {
        chapter1Complete: false,
        chapter2Complete: false,
        lastStep: currentStep,
      };
      chrome.storage.local.set({
        [STORAGE_KEY]: { ...prev, chapter2Complete: true },
      });
    });
    onClose();
  }, [currentStep, onClose]);

  // Copy helpers
  const handleCopyApiKey = useCallback(() => {
    navigator.clipboard.writeText(anthropicApiKey.trim()).then(() => {
      setCopiedApiKey(true);
      setTimeout(() => setCopiedApiKey(false), 2000);
    });
  }, [anthropicApiKey]);

  const handleCopyYaml = useCallback(() => {
    navigator.clipboard.writeText(buildWorkflowYaml(systemPrompt, selectedModel)).then(() => {
      setCopiedYaml(true);
      setTimeout(() => setCopiedYaml(false), 2000);
    });
  }, [systemPrompt, selectedModel]);

  // Determine canProceed for each step
  const canProceed =
    currentStep === 2
      ? patStatus === 'success'
      : currentStep === 3
        ? repos.length > 0
        : currentStep === 5
          ? anthropicKeyStatus === 'success'
          : true;

  // Keyboard support
  useEffect(() => {
    if (!open) return;
    const stepsWithCustomButtons = [1, 4, 8];
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'Enter' && canProceed && !stepsWithCustomButtons.includes(currentStep)) {
        handleNext();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, canProceed, currentStep, handleNext, onClose]);

  if (!open) return null;

  const isFirstStepOfChapter = chapter === 1 && currentStep === 1;
  const hideNav = currentStep === 1 || currentStep === 4 || currentStep === 8;

  // Filtered repos for dropdown
  const filteredRepos = allRepos.filter(
    r =>
      !repos.some(added => added.full_name === r.full_name) &&
      r.full_name.toLowerCase().includes(repoSearch.toLowerCase()),
  );

  // Step content renderer
  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
            <div>
              <h2 style={{ fontSize: 22, margin: '0 0 10px', color: '#f1f5f9', lineHeight: 1.2 }}>Welcome</h2>
              <p style={{ margin: 0, color: 'rgba(241,245,249,0.45)', fontSize: 13, lineHeight: 1.6 }}>
                Report visual issues directly from any website.
                <br />
                Let&apos;s get you connected in 2 minutes.
              </p>
            </div>
            <button
              onClick={handleNext}
              style={{
                width: '100%',
                borderRadius: 10,
                border: 'none',
                background: 'linear-gradient(135deg, #7c3aed, #9333ea)',
                color: '#ffffff',
                fontSize: 14,
                fontWeight: 500,
                padding: '12px 18px',
                cursor: 'pointer',
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
              Get Started
            </button>
            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                color: 'rgba(241,245,249,0.25)',
                fontSize: 12,
                cursor: 'pointer',
                padding: '4px 8px',
                transition: 'color 0.15s',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.color = 'rgba(241,245,249,0.5)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.color = 'rgba(241,245,249,0.25)';
              }}>
              Skip setup
            </button>
          </div>
        );

      case 2:
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, width: '100%' }}>
            <div>
              <h2 style={{ fontSize: 18, margin: '0 0 8px', color: '#a78bfa' }}>GitHub Token</h2>
              <p style={{ margin: 0, color: 'rgba(241,245,249,0.45)', fontSize: 13, lineHeight: 1.5 }}>
                Create a{' '}
                <a
                  href="https://github.com/settings/tokens/new?scopes=repo&description=Visual+Issue+Reporter"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: '#c4b5fd' }}>
                  classic token
                </a>{' '}
                with the{' '}
                <code style={{ background: 'rgba(148,163,184,0.08)', padding: '1px 5px', borderRadius: 4 }}>repo</code>{' '}
                scope. Works across all your organizations.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
              <input
                type="password"
                value={pat}
                onChange={e => {
                  setPat(e.target.value);
                  if (patStatus !== 'idle') {
                    setPatStatus('idle');
                    setPatError('');
                  }
                }}
                placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                style={{
                  flex: 1,
                  background: 'rgba(148,163,184,0.08)',
                  border: '1px solid rgba(148,163,184,0.15)',
                  borderRadius: 8,
                  padding: '10px 14px',
                  color: '#f1f5f9',
                  fontSize: 14,
                  outline: 'none',
                  minWidth: 0,
                  transition: 'all 0.15s',
                }}
                onFocus={e => {
                  e.currentTarget.style.borderColor = '#a78bfa';
                }}
                onBlur={e => {
                  e.currentTarget.style.borderColor = 'rgba(148,163,184,0.15)';
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleValidateToken();
                }}
              />
              <button
                onClick={handleValidateToken}
                disabled={!pat.trim() || patStatus === 'validating'}
                style={{
                  background: 'linear-gradient(135deg, #7c3aed, #9333ea)',
                  border: 'none',
                  borderRadius: 10,
                  padding: '10px 18px',
                  color: '#fff',
                  fontSize: 14,
                  fontWeight: 500,
                  cursor: !pat.trim() || patStatus === 'validating' ? 'not-allowed' : 'pointer',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                  transition: 'all 0.15s',
                  opacity: !pat.trim() || patStatus === 'validating' ? 0.45 : 1,
                }}>
                {patStatus === 'validating' ? '…' : 'Validate'}
              </button>
            </div>
            {patStatus === 'success' && (
              <div
                style={{
                  marginTop: 4,
                  fontSize: 13,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}>
                <span style={{ color: '#4ade80', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: '#4ade80',
                      display: 'inline-block',
                      flexShrink: 0,
                    }}
                  />
                  Connected{patLogin ? ` as ${patLogin}` : ''}
                </span>
              </div>
            )}
            {patStatus === 'error' && <div style={{ color: '#f87171', fontSize: 13 }}>{patError}</div>}
          </div>
        );

      case 3:
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, width: '100%' }}>
            <div>
              <h2 style={{ fontSize: 18, margin: '0 0 8px', color: '#a78bfa' }}>Repositories</h2>
              <p style={{ margin: 0, color: 'rgba(241,245,249,0.45)', fontSize: 13, lineHeight: 1.5 }}>
                Choose which repos you want to report issues on.
              </p>
            </div>
            <div style={{ position: 'relative' }}>
              <input
                ref={repoInputRef}
                type="text"
                value={repoSearch}
                onChange={e => {
                  setRepoSearch(e.target.value);
                  if (!repoDropdownOpen) setRepoDropdownOpen(true);
                }}
                onFocus={() => {
                  fetchRepos();
                  setRepoDropdownOpen(true);
                }}
                placeholder="Search repositories..."
                style={{
                  width: '100%',
                  background: 'rgba(148,163,184,0.08)',
                  border: '1px solid rgba(148,163,184,0.15)',
                  borderRadius: 8,
                  padding: '10px 14px',
                  color: '#f1f5f9',
                  fontSize: 14,
                  outline: 'none',
                  boxSizing: 'border-box',
                  minWidth: 0,
                  transition: 'all 0.15s',
                }}
                onFocusCaptureCapture={e => {
                  e.currentTarget.style.borderColor = '#a78bfa';
                }}
                onBlurCapture={e => {
                  e.currentTarget.style.borderColor = 'rgba(148,163,184,0.15)';
                }}
              />
              {repoDropdownOpen && (
                <>
                  {/* Click-outside overlay */}
                  {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
                  <div
                    onClick={() => setRepoDropdownOpen(false)}
                    style={{
                      position: 'fixed',
                      inset: 0,
                      zIndex: 1,
                    }}
                  />
                  <div
                    style={{
                      position: 'absolute',
                      top: 40,
                      left: 0,
                      right: 0,
                      maxHeight: 160,
                      overflowY: 'auto',
                      background: '#1e293b',
                      border: '1px solid rgba(148,163,184,0.15)',
                      borderRadius: 8,
                      zIndex: 2,
                      boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                    }}>
                    {filteredRepos.length === 0 ? (
                      <div
                        style={{
                          padding: '10px 12px',
                          color: 'rgba(241,245,249,0.3)',
                          fontSize: 12,
                        }}>
                        {reposFetched ? 'No matching repositories' : 'Loading...'}
                      </div>
                    ) : (
                      filteredRepos.map(repo => (
                        <button
                          key={repo.full_name}
                          type="button"
                          onClick={() => handleAddRepo(repo)}
                          style={{
                            display: 'block',
                            width: '100%',
                            padding: '8px 12px',
                            cursor: 'pointer',
                            transition: 'background 0.1s',
                            background: 'transparent',
                            border: 'none',
                            textAlign: 'left',
                          }}
                          onMouseEnter={e => {
                            e.currentTarget.style.background = 'rgba(148,163,184,0.08)';
                          }}
                          onMouseLeave={e => {
                            e.currentTarget.style.background = 'transparent';
                          }}>
                          <div style={{ color: '#f1f5f9', fontSize: 13 }}>{repo.full_name}</div>
                          {repo.description && (
                            <div
                              style={{
                                color: 'rgba(241,245,249,0.3)',
                                fontSize: 11,
                                marginTop: 2,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}>
                              {repo.description}
                            </div>
                          )}
                        </button>
                      ))
                    )}
                  </div>
                </>
              )}
            </div>
            {repos.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {repos.map(repo => (
                  <div
                    key={repo.full_name}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 10px',
                      background: 'rgba(148,163,184,0.06)',
                      borderRadius: 8,
                      border: '1px solid rgba(148,163,184,0.1)',
                    }}>
                    <span style={{ color: '#f1f5f9', fontSize: 14 }}>{repo.full_name}</span>
                    <button
                      onClick={() => handleRemoveRepo(repo.full_name)}
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: 6,
                        border: 'none',
                        background: 'transparent',
                        color: 'rgba(241,245,249,0.3)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 0,
                        fontSize: 14,
                        lineHeight: 1,
                        transition: 'color 0.1s',
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.color = '#f87171';
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.color = 'rgba(241,245,249,0.3)';
                      }}
                      aria-label={`Remove ${repo.full_name}`}>
                      <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
                        <path d="M1 1L13 13M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        );

      case 4:
        return (
          <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
            <div>
              <h2 style={{ fontSize: 18, margin: '0 0 8px', color: '#a78bfa' }}>Auto-fix with Claude Code</h2>
              <p style={{ margin: 0, color: 'rgba(241,245,249,0.45)', fontSize: 13, lineHeight: 1.5 }}>
                Let Claude Code automatically analyze reported issues and open a PR with the fix.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 10, width: '100%' }}>
              <button
                onClick={() => {
                  handleFinishChapter1();
                  onClose();
                }}
                style={{
                  flex: 1,
                  borderRadius: 10,
                  border: '1px solid rgba(148,163,184,0.2)',
                  background: 'transparent',
                  color: 'rgba(241,245,249,0.5)',
                  fontSize: 14,
                  fontWeight: 500,
                  padding: '10px 18px',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = 'rgba(148,163,184,0.35)';
                  e.currentTarget.style.color = 'rgba(241,245,249,0.7)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = 'rgba(148,163,184,0.2)';
                  e.currentTarget.style.color = 'rgba(241,245,249,0.5)';
                }}>
                Skip for now
              </button>
              <button
                onClick={() => {
                  handleFinishChapter1();
                  animateToStep(5);
                }}
                style={{
                  flex: 1,
                  borderRadius: 10,
                  border: 'none',
                  background: 'linear-gradient(135deg, #7c3aed, #9333ea)',
                  color: '#ffffff',
                  fontSize: 14,
                  fontWeight: 500,
                  padding: '10px 18px',
                  cursor: 'pointer',
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
                Yes, set it up
              </button>
            </div>
          </div>
        );

      case 5:
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, width: '100%' }}>
            <div>
              <h2 style={{ fontSize: 18, margin: '0 0 8px', color: '#a78bfa' }}>Anthropic API Key</h2>
              <p style={{ margin: 0, color: 'rgba(241,245,249,0.45)', fontSize: 13, lineHeight: 1.5 }}>
                Enter your API key to enable Claude Code auto-fix. Get your key from{' '}
                <a
                  href="https://console.anthropic.com/settings/keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: '#c4b5fd' }}>
                  console.anthropic.com
                </a>
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
              <input
                type="password"
                value={anthropicApiKey}
                onChange={e => {
                  setAnthropicApiKey(e.target.value);
                  if (anthropicKeyStatus !== 'idle') {
                    setAnthropicKeyStatus('idle');
                    setAnthropicKeyError('');
                  }
                }}
                placeholder="sk-ant-xxxxxxxxxxxx"
                style={{
                  flex: 1,
                  background: 'rgba(148,163,184,0.08)',
                  border: '1px solid rgba(148,163,184,0.15)',
                  borderRadius: 8,
                  padding: '10px 14px',
                  color: '#f1f5f9',
                  fontSize: 14,
                  outline: 'none',
                  minWidth: 0,
                  transition: 'all 0.15s',
                }}
                onFocus={e => {
                  e.currentTarget.style.borderColor = '#a78bfa';
                }}
                onBlur={e => {
                  e.currentTarget.style.borderColor = 'rgba(148,163,184,0.15)';
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleValidateAnthropicKey();
                }}
              />
              <button
                onClick={handleValidateAnthropicKey}
                disabled={!anthropicApiKey.trim() || anthropicKeyStatus === 'validating'}
                style={{
                  background: 'linear-gradient(135deg, #7c3aed, #9333ea)',
                  border: 'none',
                  borderRadius: 10,
                  padding: '10px 18px',
                  color: '#fff',
                  fontSize: 14,
                  fontWeight: 500,
                  cursor: !anthropicApiKey.trim() || anthropicKeyStatus === 'validating' ? 'not-allowed' : 'pointer',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                  transition: 'all 0.15s',
                  opacity: !anthropicApiKey.trim() || anthropicKeyStatus === 'validating' ? 0.45 : 1,
                }}>
                {anthropicKeyStatus === 'validating' ? '…' : 'Validate'}
              </button>
            </div>
            {anthropicKeyStatus === 'success' && (
              <div
                style={{
                  marginTop: 4,
                  fontSize: 13,
                  display: 'flex',
                  alignItems: 'center',
                }}>
                <span style={{ color: '#4ade80', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: '#4ade80',
                      display: 'inline-block',
                      flexShrink: 0,
                    }}
                  />
                  Connected
                </span>
              </div>
            )}
            {anthropicKeyStatus === 'error' && (
              <div style={{ color: '#f87171', fontSize: 13 }}>{anthropicKeyError}</div>
            )}
          </div>
        );

      case 6:
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, width: '100%' }}>
            <div>
              <h2 style={{ fontSize: 18, margin: '0 0 8px', color: '#a78bfa' }}>Repository Secrets</h2>
              <p style={{ margin: 0, color: 'rgba(241,245,249,0.45)', fontSize: 13, lineHeight: 1.5 }}>
                Each repo needs a secret named{' '}
                <code style={{ background: 'rgba(148,163,184,0.08)', padding: '1px 5px', borderRadius: 4 }}>
                  ANTHROPIC_API_KEY
                </code>{' '}
                for the GitHub Action to work.
              </p>
            </div>
            <button
              onClick={handleCopyApiKey}
              style={{
                borderRadius: 10,
                border: copiedApiKey ? '1px solid rgba(74,222,128,0.3)' : '1px solid rgba(148,163,184,0.15)',
                background: copiedApiKey ? 'rgba(74,222,128,0.08)' : 'rgba(148,163,184,0.08)',
                color: copiedApiKey ? '#4ade80' : '#f1f5f9',
                fontSize: 14,
                fontWeight: 500,
                padding: '10px 18px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                transition: 'all 0.15s cubic-bezier(0.25, 1, 0.5, 1)',
              }}>
              {copiedApiKey ? (
                <>
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <path
                      d="M3 8.5L6.5 12L13 4"
                      stroke="#4ade80"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  Copied!
                </>
              ) : (
                'Copy API key'
              )}
            </button>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {storedRepos.map(repo => {
                const status = repoSecretStatus[repo] ?? 'checking';
                return (
                  <div
                    key={repo}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 10px',
                      background: 'rgba(148,163,184,0.06)',
                      borderRadius: 8,
                      border: '1px solid rgba(148,163,184,0.1)',
                    }}>
                    <span style={{ color: '#f1f5f9', fontSize: 13 }}>{repo}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, flexShrink: 0 }}>
                      <div
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          background:
                            status === 'exists'
                              ? '#4ade80'
                              : status === 'missing'
                                ? '#f87171'
                                : 'rgba(148,163,184,0.4)',
                          flexShrink: 0,
                        }}
                      />
                      {status === 'exists' && <span style={{ color: '#4ade80' }}>Ready</span>}
                      {status === 'missing' && (
                        <a
                          href={`https://github.com/${repo}/settings/secrets/actions/new?secret_name=ANTHROPIC_API_KEY`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: '#f87171', textDecoration: 'none' }}
                          onMouseEnter={e => {
                            e.currentTarget.style.textDecoration = 'underline';
                          }}
                          onMouseLeave={e => {
                            e.currentTarget.style.textDecoration = 'none';
                          }}>
                          Add secret &rarr;
                        </a>
                      )}
                      {status === 'checking' && <span style={{ color: 'rgba(148,163,184,0.4)' }}>Checking...</span>}
                    </div>
                  </div>
                );
              })}
            </div>
            <button
              onClick={checkAllSecrets}
              style={{
                background: 'none',
                border: 'none',
                color: 'rgba(241,245,249,0.45)',
                fontSize: 12,
                cursor: 'pointer',
                textDecoration: 'underline',
                padding: 0,
                alignSelf: 'flex-start',
              }}>
              Re-check
            </button>
          </div>
        );

      case 7:
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, width: '100%' }}>
            <div>
              <h2 style={{ fontSize: 18, margin: '0 0 8px', color: '#a78bfa' }}>Workflow File</h2>
              <p style={{ margin: 0, color: 'rgba(241,245,249,0.45)', fontSize: 13, lineHeight: 1.5 }}>
                Each repo needs a GitHub Action workflow file.
              </p>
            </div>
            <div
              style={{
                position: 'relative',
                background: 'rgba(148,163,184,0.08)',
                borderRadius: 8,
                border: '1px solid rgba(148,163,184,0.15)',
                overflow: 'hidden',
              }}>
              <pre
                style={{
                  margin: 0,
                  padding: '12px',
                  fontSize: 11,
                  lineHeight: 1.5,
                  color: '#c4b5fd',
                  fontFamily: 'monospace',
                  overflowX: 'auto',
                  maxHeight: 160,
                  overflowY: 'auto',
                  whiteSpace: 'pre',
                }}>
                <code>{buildWorkflowYaml(systemPrompt, selectedModel)}</code>
              </pre>
            </div>
            <button
              onClick={handleCopyYaml}
              style={{
                borderRadius: 10,
                border: copiedYaml ? '1px solid rgba(74,222,128,0.3)' : '1px solid rgba(148,163,184,0.15)',
                background: copiedYaml ? 'rgba(74,222,128,0.08)' : 'rgba(148,163,184,0.08)',
                color: copiedYaml ? '#4ade80' : '#f1f5f9',
                fontSize: 14,
                fontWeight: 500,
                padding: '10px 18px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                transition: 'all 0.15s cubic-bezier(0.25, 1, 0.5, 1)',
              }}>
              {copiedYaml ? (
                <>
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <path
                      d="M3 8.5L6.5 12L13 4"
                      stroke="#4ade80"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  Copied!
                </>
              ) : (
                'Copy YAML'
              )}
            </button>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {storedRepos.map(repo => {
                const status = repoWorkflowStatus[repo] ?? 'checking';
                return (
                  <div
                    key={repo}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 10px',
                      background: 'rgba(148,163,184,0.06)',
                      borderRadius: 8,
                      border: '1px solid rgba(148,163,184,0.1)',
                    }}>
                    <span style={{ color: '#f1f5f9', fontSize: 13 }}>{repo}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, flexShrink: 0 }}>
                      <div
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          background:
                            status === 'exists'
                              ? '#4ade80'
                              : status === 'missing'
                                ? '#f87171'
                                : 'rgba(148,163,184,0.4)',
                          flexShrink: 0,
                        }}
                      />
                      {status === 'exists' && <span style={{ color: '#4ade80' }}>Ready</span>}
                      {status === 'missing' && (
                        <a
                          href={`https://github.com/${repo}/new/main?filename=.github/workflows/visual-issue-claude-fix.yml`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: '#f87171', textDecoration: 'none' }}
                          onMouseEnter={e => {
                            e.currentTarget.style.textDecoration = 'underline';
                          }}
                          onMouseLeave={e => {
                            e.currentTarget.style.textDecoration = 'none';
                          }}>
                          Add workflow &rarr;
                        </a>
                      )}
                      {status === 'checking' && <span style={{ color: 'rgba(148,163,184,0.4)' }}>Checking...</span>}
                    </div>
                  </div>
                );
              })}
            </div>
            <button
              onClick={checkAllWorkflows}
              style={{
                background: 'none',
                border: 'none',
                color: 'rgba(241,245,249,0.45)',
                fontSize: 12,
                cursor: 'pointer',
                textDecoration: 'underline',
                padding: 0,
                alignSelf: 'flex-start',
              }}>
              Re-check
            </button>
          </div>
        );

      case 8:
        return (
          <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 12,
                background: 'rgba(74,222,128,0.12)',
                border: '1px solid rgba(74,222,128,0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path
                  d="M5 13L9.5 17.5L19 7"
                  stroke="#4ade80"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <div>
              <h2 style={{ fontSize: 18, margin: '0 0 8px', color: '#a78bfa' }}>You&apos;re all set!</h2>
              <p style={{ margin: 0, color: 'rgba(241,245,249,0.45)', fontSize: 13, lineHeight: 1.5 }}>
                Claude Code will automatically analyze issues and open PRs with fixes.
              </p>
            </div>
            <button
              onClick={handleFinishChapter2}
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
                marginTop: 4,
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
              Start Reporting
            </button>
          </div>
        );

      default:
        return null;
    }
  };

  // Compute step counter for the bottom nav bar
  const getStepIndicator = (): { current: number; total: number } | null => {
    if (hideNav) return null;
    if (currentStep <= 4) {
      // Chapter 1 navigable steps: 2, 3
      const ch1Steps = [2, 3];
      const idx = ch1Steps.indexOf(currentStep);
      return idx >= 0 ? { current: idx + 1, total: ch1Steps.length } : null;
    }
    // Chapter 2 navigable steps: 5, 6, 7
    const ch2Steps = [5, 6, 7];
    const idx = ch2Steps.indexOf(currentStep);
    return idx >= 0 ? { current: idx + 1, total: ch2Steps.length } : null;
  };
  const stepIndicator = getStepIndicator();

  return (
    <div
      style={{
        flex: 1,
        background: '#0f172a',
        color: '#f1f5f9',
        fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif",
        boxSizing: 'border-box',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
      }}>
      {/* Hero image — shown on welcome (step 1) and chapter 2 intro (step 5 intro already has own heading) */}
      {currentStep === 1 && (
        <div
          style={{
            position: 'relative',
            width: '100%',
            height: 160,
            overflow: 'hidden',
            flexShrink: 0,
          }}>
          <img
            src={onboardingHero}
            alt="Visual Issue Reporter"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              objectPosition: 'center 40%',
              display: 'block',
            }}
          />
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'linear-gradient(to bottom, transparent 40%, #0f172a)',
            }}
          />
        </div>
      )}

      {/* Header with hero background for non-welcome steps */}
      {currentStep !== 1 && (
        <div
          style={{
            position: 'relative',
            width: '100%',
            overflow: 'hidden',
            flexShrink: 0,
          }}>
          {/* Hero background */}
          <img
            src={onboardingHero}
            alt=""
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              objectPosition: 'center 40%',
              opacity: 0.25,
            }}
          />
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'linear-gradient(to bottom, rgba(15,23,42,0.4) 0%, #0f172a 100%)',
            }}
          />
          {/* Header content */}
          <div
            style={{
              position: 'relative',
              padding: '20px 20px 16px',
            }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button
                onClick={onClose}
                aria-label="Back to settings"
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
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = 'rgba(148,163,184,0.15)';
                  e.currentTarget.style.color = '#f1f5f9';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'rgba(148,163,184,0.08)';
                  e.currentTarget.style.color = 'rgba(241,245,249,0.6)';
                }}>
                ←
              </button>
              <h1 style={{ fontSize: 22, margin: 0, color: '#f1f5f9', lineHeight: 1.2 }}>Setup Guide</h1>
            </div>
          </div>
        </div>
      )}

      {/* Main content area */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          padding: '0 20px',
          position: 'relative',
        }}>
        {/* Step content */}
        <div
          style={{
            flex: 1,
            opacity: stepOpacity,
            transition: 'opacity 0.15s cubic-bezier(0.25, 1, 0.5, 1)',
            minHeight: 120,
            display: 'flex',
            alignItems: [2, 3, 5, 6, 7].includes(currentStep) ? 'flex-start' : 'center',
            justifyContent: 'center',
            paddingTop: currentStep === 1 ? 0 : 8,
          }}>
          {renderStepContent()}
        </div>

        {/* Bottom navigation bar — ← 1/3 → */}
        {!hideNav && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '16px 0 28px',
              gap: 16,
            }}>
            {/* Back */}
            <button
              onClick={handleBack}
              disabled={isFirstStepOfChapter}
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                border: '1px solid rgba(148,163,184,0.12)',
                background: 'rgba(148,163,184,0.06)',
                color: isFirstStepOfChapter ? 'rgba(148,163,184,0.15)' : 'rgba(241,245,249,0.6)',
                cursor: isFirstStepOfChapter ? 'default' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 0,
                flexShrink: 0,
                transition: 'all 0.15s',
                opacity: isFirstStepOfChapter ? 0.4 : 1,
              }}
              onMouseEnter={e => {
                if (!isFirstStepOfChapter) {
                  e.currentTarget.style.background = 'rgba(148,163,184,0.12)';
                  e.currentTarget.style.borderColor = 'rgba(148,163,184,0.2)';
                  e.currentTarget.style.color = '#f1f5f9';
                }
              }}
              onMouseLeave={e => {
                if (!isFirstStepOfChapter) {
                  e.currentTarget.style.background = 'rgba(148,163,184,0.06)';
                  e.currentTarget.style.borderColor = 'rgba(148,163,184,0.12)';
                  e.currentTarget.style.color = 'rgba(241,245,249,0.6)';
                }
              }}
              aria-label="Previous step">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path
                  d="M10 3L5 8L10 13"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>

            {/* Step counter */}
            {stepIndicator && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  color: 'rgba(241,245,249,0.35)',
                  fontSize: 12,
                  fontWeight: 500,
                  letterSpacing: '0.05em',
                  userSelect: 'none',
                  minWidth: 32,
                  justifyContent: 'center',
                }}>
                <span style={{ color: '#a78bfa', fontWeight: 600 }}>{stepIndicator.current}</span>
                <span style={{ fontSize: 10 }}>/</span>
                <span>{stepIndicator.total}</span>
              </div>
            )}

            {/* Next */}
            <button
              onClick={handleNext}
              disabled={!canProceed}
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                border: 'none',
                background: canProceed ? 'linear-gradient(135deg, #7c3aed, #9333ea)' : 'rgba(148,163,184,0.06)',
                borderStyle: canProceed ? 'none' : 'solid',
                borderWidth: canProceed ? 0 : 1,
                borderColor: canProceed ? 'transparent' : 'rgba(148,163,184,0.12)',
                color: canProceed ? '#ffffff' : 'rgba(148,163,184,0.15)',
                cursor: canProceed ? 'pointer' : 'default',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 0,
                flexShrink: 0,
                transition: 'all 0.15s',
                opacity: canProceed ? 1 : 0.4,
              }}
              onMouseEnter={e => {
                if (canProceed) {
                  e.currentTarget.style.opacity = '0.85';
                  e.currentTarget.style.transform = 'translateY(-1px)';
                }
              }}
              onMouseLeave={e => {
                if (canProceed) {
                  e.currentTarget.style.opacity = '1';
                  e.currentTarget.style.transform = 'none';
                }
              }}
              aria-label="Next step">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path
                  d="M6 3L11 8L6 13"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default OnboardingWizard;
