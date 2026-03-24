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

const WORKFLOW_YAML = `name: Visual Issue Claude Fix

on:
  issues:
    types: [labeled]

permissions:
  contents: write
  pull-requests: write
  issues: write

jobs:
  auto-fix:
    if: github.event.label.name == 'auto-fix'
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Run Claude
        uses: anthropics/claude-code-action@v1
        with:
          anthropic_api_key: \${{ secrets.ANTHROPIC_API_KEY }}
          prompt: |
            You fix visual issues reported via the Visual Issue Reporter Chrome extension.
            Read the issue description, study the annotated screenshot, cross-reference with
            HTML snippets and console errors, identify the relevant source files, and create
            a minimal targeted fix. Open a PR referencing the issue.`;

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

  // Steps 6/7 shared: repo list from storage
  const [storedRepos, setStoredRepos] = useState<string[]>([]);

  // Step 3 state: Repos
  const [repos, setRepos] = useState<Array<{ full_name: string; description: string | null }>>([]);
  const [allRepos, setAllRepos] = useState<Array<{ full_name: string; description: string | null }>>([]);
  const [repoSearch, setRepoSearch] = useState('');
  const [repoDropdownOpen, setRepoDropdownOpen] = useState(false);
  const [reposFetched, setReposFetched] = useState(false);
  const repoInputRef = useRef<HTMLInputElement>(null);

  // On mount, read stored progress and resume if applicable
  useEffect(() => {
    chrome.storage.local.get(STORAGE_KEY, result => {
      const progress = result[STORAGE_KEY] as OnboardingProgress | undefined;
      if (progress) {
        const shouldResume =
          (chapter === 1 && !progress.chapter1Complete) || (chapter === 2 && !progress.chapter2Complete);
        if (shouldResume && progress.lastStep >= 1 && progress.lastStep <= TOTAL_STEPS) {
          // Only resume if lastStep belongs to this chapter
          const inChapter1 = progress.lastStep >= 1 && progress.lastStep <= 4;
          const inChapter2 = progress.lastStep >= CHAPTER_2_START && progress.lastStep <= TOTAL_STEPS;
          if ((chapter === 1 && inChapter1) || (chapter === 2 && inChapter2)) {
            setCurrentStep(progress.lastStep);
          }
        }
      }
      setInitialized(true);
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
    const minStep = chapter === 2 ? CHAPTER_2_START : 1;
    if (currentStep > minStep) {
      animateToStep(currentStep - 1);
    }
  }, [currentStep, chapter, animateToStep]);

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
      chrome.storage.sync.set({ repoList });
      if (updated.length === 1) {
        chrome.storage.sync.set({ selectedRepo: repo.full_name });
      }
    },
    [repos],
  );

  const handleRemoveRepo = useCallback(
    (fullName: string) => {
      const updated = repos.filter(r => r.full_name !== fullName);
      setRepos(updated);

      const repoList = updated.map(r => r.full_name);
      chrome.storage.sync.set({ repoList });

      // If we removed the selected repo, select the first remaining one
      chrome.storage.sync.get('selectedRepo', result => {
        if (result.selectedRepo === fullName) {
          chrome.storage.sync.set({ selectedRepo: updated.length > 0 ? updated[0].full_name : '' });
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
    navigator.clipboard.writeText(WORKFLOW_YAML).then(() => {
      setCopiedYaml(true);
      setTimeout(() => setCopiedYaml(false), 2000);
    });
  }, []);

  if (!open) return null;

  const isFirstStepOfChapter = chapter === 1 ? currentStep === 1 : currentStep === CHAPTER_2_START;
  const hideNav = currentStep === 1 || currentStep === 4 || currentStep === 8;

  // Determine canProceed for each step
  const canProceed =
    currentStep === 2
      ? patStatus === 'success'
      : currentStep === 3
        ? repos.length > 0
        : currentStep === 5
          ? anthropicKeyStatus === 'success'
          : true;

  // Steps 6/7: check if all repos are green
  const allSecretsReady = storedRepos.length > 0 && storedRepos.every(r => repoSecretStatus[r] === 'exists');
  const allWorkflowsReady = storedRepos.length > 0 && storedRepos.every(r => repoWorkflowStatus[r] === 'exists');

  // Dynamic next button text
  const nextButtonText =
    currentStep === 6 && !allSecretsReady
      ? 'Continue anyway'
      : currentStep === 7 && !allWorkflowsReady
        ? 'Continue anyway'
        : 'Next';

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
          <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 12,
                background: 'linear-gradient(135deg, #7c3aed, #9333ea)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 22,
              }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path
                  d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"
                  fill="#ffffff"
                  stroke="#ffffff"
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <div>
              <div style={{ color: '#f1f5f9', fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
                Welcome to Visual Issue Reporter
              </div>
              <div style={{ color: 'rgba(241,245,249,0.45)', fontSize: 13, lineHeight: 1.5 }}>
                Report visual issues directly from any website. Let&apos;s get you connected in 2 minutes.
              </div>
            </div>
            <button
              onClick={handleNext}
              style={{
                width: '100%',
                height: 40,
                borderRadius: 10,
                border: 'none',
                background: 'linear-gradient(135deg, #7c3aed, #9333ea)',
                color: '#ffffff',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
                marginTop: 4,
                transition:
                  'opacity 0.15s cubic-bezier(0.25, 1, 0.5, 1), transform 0.15s cubic-bezier(0.25, 1, 0.5, 1)',
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
          </div>
        );

      case 2:
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, width: '100%' }}>
            <div>
              <div style={{ color: '#f1f5f9', fontSize: 16, fontWeight: 600, marginBottom: 6 }}>
                Connect your GitHub account
              </div>
              <div style={{ color: 'rgba(241,245,249,0.45)', fontSize: 13, lineHeight: 1.5 }}>
                Create a classic token with the{' '}
                <code
                  style={{
                    background: 'rgba(148,163,184,0.12)',
                    padding: '1px 5px',
                    borderRadius: 4,
                    fontSize: 12,
                    color: '#a78bfa',
                  }}>
                  repo
                </code>{' '}
                scope.{' '}
                <a
                  href="https://github.com/settings/tokens/new?scopes=repo&description=Visual+Issue+Reporter"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: '#a78bfa', textDecoration: 'none' }}
                  onMouseEnter={e => {
                    e.currentTarget.style.textDecoration = 'underline';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.textDecoration = 'none';
                  }}>
                  Create token
                </a>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
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
                placeholder="ghp_xxxxxxxxxxxx"
                style={{
                  flex: 1,
                  height: 36,
                  borderRadius: 8,
                  border: '1px solid rgba(148,163,184,0.15)',
                  background: 'rgba(148,163,184,0.08)',
                  color: '#f1f5f9',
                  fontSize: 13,
                  padding: '0 12px',
                  outline: 'none',
                  fontFamily: 'monospace',
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
                  height: 36,
                  borderRadius: 8,
                  border: 'none',
                  background:
                    !pat.trim() || patStatus === 'validating'
                      ? 'rgba(148,163,184,0.15)'
                      : 'linear-gradient(135deg, #7c3aed, #9333ea)',
                  color: !pat.trim() || patStatus === 'validating' ? 'rgba(241,245,249,0.3)' : '#ffffff',
                  fontSize: 13,
                  fontWeight: 600,
                  padding: '0 14px',
                  cursor: !pat.trim() || patStatus === 'validating' ? 'not-allowed' : 'pointer',
                  whiteSpace: 'nowrap',
                  transition: 'opacity 0.15s cubic-bezier(0.25, 1, 0.5, 1)',
                }}>
                Validate
              </button>
            </div>
            {patStatus === 'validating' && (
              <div style={{ color: 'rgba(241,245,249,0.45)', fontSize: 12 }}>Validating...</div>
            )}
            {patStatus === 'success' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                <div
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: '#4ade80',
                    flexShrink: 0,
                  }}
                />
                <span style={{ color: '#4ade80' }}>Connected as {patLogin}</span>
              </div>
            )}
            {patStatus === 'error' && <div style={{ color: '#f87171', fontSize: 12 }}>{patError}</div>}
          </div>
        );

      case 3:
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, width: '100%' }}>
            <div>
              <div style={{ color: '#f1f5f9', fontSize: 16, fontWeight: 600, marginBottom: 6 }}>
                Select repositories
              </div>
              <div style={{ color: 'rgba(241,245,249,0.45)', fontSize: 13, lineHeight: 1.5 }}>
                Choose which repos you want to report issues on.
              </div>
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
                  height: 36,
                  borderRadius: 8,
                  border: '1px solid rgba(148,163,184,0.15)',
                  background: 'rgba(148,163,184,0.08)',
                  color: '#f1f5f9',
                  fontSize: 13,
                  padding: '0 12px',
                  outline: 'none',
                  boxSizing: 'border-box',
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
                    <span style={{ color: '#f1f5f9', fontSize: 13 }}>{repo.full_name}</span>
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
              <div style={{ color: '#f1f5f9', fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
                Enable auto-fix with Claude Code?
              </div>
              <div style={{ color: 'rgba(241,245,249,0.45)', fontSize: 13, lineHeight: 1.5 }}>
                Let Claude Code automatically analyze visual issues and open PRs with fixes.
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, width: '100%' }}>
              <button
                onClick={() => {
                  handleFinishChapter1();
                  onClose();
                }}
                style={{
                  flex: 1,
                  height: 40,
                  borderRadius: 10,
                  border: '1px solid rgba(148,163,184,0.2)',
                  background: 'transparent',
                  color: 'rgba(241,245,249,0.5)',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition:
                    'border-color 0.15s cubic-bezier(0.25, 1, 0.5, 1), color 0.15s cubic-bezier(0.25, 1, 0.5, 1)',
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
                  height: 40,
                  borderRadius: 10,
                  border: 'none',
                  background: 'linear-gradient(135deg, #7c3aed, #9333ea)',
                  color: '#ffffff',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition:
                    'opacity 0.15s cubic-bezier(0.25, 1, 0.5, 1), transform 0.15s cubic-bezier(0.25, 1, 0.5, 1)',
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
              <div style={{ color: '#f1f5f9', fontSize: 16, fontWeight: 600, marginBottom: 6 }}>Connect Anthropic</div>
              <div style={{ color: 'rgba(241,245,249,0.45)', fontSize: 13, lineHeight: 1.5 }}>
                Enter your API key to enable Claude Code.
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
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
                  height: 36,
                  borderRadius: 8,
                  border: '1px solid rgba(148,163,184,0.15)',
                  background: 'rgba(148,163,184,0.08)',
                  color: '#f1f5f9',
                  fontSize: 13,
                  padding: '0 12px',
                  outline: 'none',
                  fontFamily: 'monospace',
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
                  height: 36,
                  borderRadius: 8,
                  border: 'none',
                  background:
                    !anthropicApiKey.trim() || anthropicKeyStatus === 'validating'
                      ? 'rgba(148,163,184,0.15)'
                      : 'linear-gradient(135deg, #7c3aed, #9333ea)',
                  color:
                    !anthropicApiKey.trim() || anthropicKeyStatus === 'validating'
                      ? 'rgba(241,245,249,0.3)'
                      : '#ffffff',
                  fontSize: 13,
                  fontWeight: 600,
                  padding: '0 14px',
                  cursor: !anthropicApiKey.trim() || anthropicKeyStatus === 'validating' ? 'not-allowed' : 'pointer',
                  whiteSpace: 'nowrap',
                  transition: 'opacity 0.15s cubic-bezier(0.25, 1, 0.5, 1)',
                }}>
                Validate
              </button>
            </div>
            {anthropicKeyStatus === 'validating' && (
              <div style={{ color: 'rgba(241,245,249,0.45)', fontSize: 12 }}>Validating...</div>
            )}
            {anthropicKeyStatus === 'success' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                <div
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: '#4ade80',
                    flexShrink: 0,
                  }}
                />
                <span style={{ color: '#4ade80' }}>Connected</span>
              </div>
            )}
            {anthropicKeyStatus === 'error' && (
              <div style={{ color: '#f87171', fontSize: 12 }}>{anthropicKeyError}</div>
            )}
            <a
              href="https://console.anthropic.com/settings/keys"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: '#a78bfa', fontSize: 12, textDecoration: 'none' }}
              onMouseEnter={e => {
                e.currentTarget.style.textDecoration = 'underline';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.textDecoration = 'none';
              }}>
              Get your key from console.anthropic.com
            </a>
          </div>
        );

      case 6:
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, width: '100%' }}>
            <div>
              <div style={{ color: '#f1f5f9', fontSize: 16, fontWeight: 600, marginBottom: 6 }}>
                Add API key to your repos
              </div>
              <div style={{ color: 'rgba(241,245,249,0.45)', fontSize: 13, lineHeight: 1.5 }}>
                Each repo needs a secret named{' '}
                <code
                  style={{
                    background: 'rgba(148,163,184,0.12)',
                    padding: '1px 5px',
                    borderRadius: 4,
                    fontSize: 12,
                    color: '#c4b5fd',
                  }}>
                  ANTHROPIC_API_KEY
                </code>{' '}
                for the GitHub Action to work.
              </div>
            </div>
            <button
              onClick={handleCopyApiKey}
              style={{
                height: 36,
                borderRadius: 8,
                border: copiedApiKey ? '1px solid rgba(74,222,128,0.3)' : '1px solid rgba(148,163,184,0.15)',
                background: copiedApiKey ? 'rgba(74,222,128,0.08)' : 'rgba(148,163,184,0.08)',
                color: copiedApiKey ? '#4ade80' : '#f1f5f9',
                fontSize: 13,
                fontWeight: 600,
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
              <div style={{ color: '#f1f5f9', fontSize: 16, fontWeight: 600, marginBottom: 6 }}>
                Add the workflow file
              </div>
              <div style={{ color: 'rgba(241,245,249,0.45)', fontSize: 13, lineHeight: 1.5 }}>
                Each repo needs a GitHub Action workflow file.
              </div>
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
                <code>{WORKFLOW_YAML}</code>
              </pre>
            </div>
            <button
              onClick={handleCopyYaml}
              style={{
                height: 36,
                borderRadius: 8,
                border: copiedYaml ? '1px solid rgba(74,222,128,0.3)' : '1px solid rgba(148,163,184,0.15)',
                background: copiedYaml ? 'rgba(74,222,128,0.08)' : 'rgba(148,163,184,0.08)',
                color: copiedYaml ? '#4ade80' : '#f1f5f9',
                fontSize: 13,
                fontWeight: 600,
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
              <div style={{ color: '#f1f5f9', fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
                You&apos;re all set!
              </div>
              <div style={{ color: 'rgba(241,245,249,0.45)', fontSize: 13, lineHeight: 1.5 }}>
                Claude Code will automatically analyze issues and open PRs with fixes.
              </div>
            </div>
            <button
              onClick={handleFinishChapter2}
              style={{
                width: '100%',
                height: 40,
                borderRadius: 10,
                border: 'none',
                background: 'linear-gradient(135deg, #7c3aed, #9333ea)',
                color: '#ffffff',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
                marginTop: 4,
                transition:
                  'opacity 0.15s cubic-bezier(0.25, 1, 0.5, 1), transform 0.15s cubic-bezier(0.25, 1, 0.5, 1)',
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

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        zIndex: 2147483647,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      {/* Modal body */}
      <div
        style={{
          background: '#1e293b',
          borderRadius: 16,
          maxWidth: 360,
          width: 'calc(100% - 32px)',
          maxHeight: 'calc(100vh - 80px)',
          overflowY: 'auto',
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          padding: '24px 20px 20px',
        }}>
        {/* Close button */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: 12,
            right: 12,
            width: 28,
            height: 28,
            borderRadius: 8,
            border: 'none',
            background: 'rgba(148,163,184,0.08)',
            color: 'rgba(241,245,249,0.45)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 16,
            lineHeight: 1,
            padding: 0,
            transition: 'background 0.15s cubic-bezier(0.25, 1, 0.5, 1), color 0.15s cubic-bezier(0.25, 1, 0.5, 1)',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'rgba(148,163,184,0.15)';
            e.currentTarget.style.color = '#f1f5f9';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'rgba(148,163,184,0.08)';
            e.currentTarget.style.color = 'rgba(241,245,249,0.45)';
          }}
          aria-label="Close">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M1 1L13 13M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>

        {/* Progress dots */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            marginBottom: 20,
            paddingTop: 4,
          }}>
          {Array.from({ length: TOTAL_STEPS }, (_, i) => {
            const stepNum = i + 1;
            const isFilled = stepNum <= currentStep;
            const isCurrent = stepNum === currentStep;
            const isChapterGap = stepNum === CHAPTER_2_START;

            return (
              <div key={stepNum} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {isChapterGap && (
                  <div
                    style={{
                      width: 8,
                      height: 1,
                      background: 'rgba(148,163,184,0.15)',
                      marginRight: 0,
                    }}
                  />
                )}
                <div
                  style={{
                    width: isCurrent ? 10 : 8,
                    height: isCurrent ? 10 : 8,
                    borderRadius: '50%',
                    background: isFilled ? '#a78bfa' : 'transparent',
                    border: `2px solid ${isFilled ? '#a78bfa' : 'rgba(148,163,184,0.3)'}`,
                    transition: 'all 0.2s cubic-bezier(0.25, 1, 0.5, 1)',
                    flexShrink: 0,
                  }}
                />
              </div>
            );
          })}
        </div>

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
          }}>
          {renderStepContent()}
        </div>

        {/* Navigation - hidden on steps 1, 4, and 8 */}
        {!hideNav && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginTop: 20,
              gap: 12,
            }}>
            {/* Back button */}
            <button
              onClick={handleBack}
              style={{
                visibility: isFirstStepOfChapter ? 'hidden' : 'visible',
                width: 36,
                height: 36,
                borderRadius: 10,
                border: '1px solid rgba(148,163,184,0.15)',
                background: 'rgba(148,163,184,0.08)',
                color: '#f1f5f9',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 0,
                flexShrink: 0,
                transition:
                  'background 0.15s cubic-bezier(0.25, 1, 0.5, 1), border-color 0.15s cubic-bezier(0.25, 1, 0.5, 1)',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'rgba(148,163,184,0.15)';
                e.currentTarget.style.borderColor = 'rgba(148,163,184,0.25)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'rgba(148,163,184,0.08)';
                e.currentTarget.style.borderColor = 'rgba(148,163,184,0.15)';
              }}
              aria-label="Back">
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

            {/* Next button */}
            <button
              onClick={handleNext}
              disabled={!canProceed}
              style={{
                flex: 1,
                height: 36,
                borderRadius: 10,
                border: 'none',
                background: canProceed ? 'linear-gradient(135deg, #7c3aed, #9333ea)' : 'rgba(148,163,184,0.15)',
                color: canProceed ? '#ffffff' : 'rgba(241,245,249,0.3)',
                fontSize: 13,
                fontWeight: 600,
                cursor: canProceed ? 'pointer' : 'not-allowed',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                transition:
                  'opacity 0.15s cubic-bezier(0.25, 1, 0.5, 1), transform 0.15s cubic-bezier(0.25, 1, 0.5, 1)',
              }}
              onMouseEnter={e => {
                if (canProceed) {
                  e.currentTarget.style.opacity = '0.9';
                  e.currentTarget.style.transform = 'translateY(-1px)';
                }
              }}
              onMouseLeave={e => {
                e.currentTarget.style.opacity = '1';
                e.currentTarget.style.transform = 'none';
              }}>
              {nextButtonText}
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
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
