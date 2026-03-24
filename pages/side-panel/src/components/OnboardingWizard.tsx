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

const OnboardingWizard = ({ open, chapter, onClose }: OnboardingWizardProps) => {
  const [currentStep, setCurrentStep] = useState(() => getInitialStep(chapter));
  const [stepOpacity, setStepOpacity] = useState(1);
  const [initialized, setInitialized] = useState(false);

  // Step 2 state: GitHub token
  const [pat, setPat] = useState('');
  const [patStatus, setPatStatus] = useState<'idle' | 'validating' | 'success' | 'error'>('idle');
  const [patLogin, setPatLogin] = useState('');
  const [patError, setPatError] = useState('');

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

  if (!open) return null;

  const isFirstStepOfChapter = chapter === 1 ? currentStep === 1 : currentStep === CHAPTER_2_START;
  const hideNav = currentStep === 1 || currentStep === 4;

  // Determine canProceed for each step
  const canProceed = currentStep === 2 ? patStatus === 'success' : currentStep === 3 ? repos.length > 0 : true;

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

      default:
        return <div style={{ color: '#f1f5f9', fontSize: 14, textAlign: 'center' }}>Step {currentStep}</div>;
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
            alignItems: currentStep === 2 || currentStep === 3 ? 'flex-start' : 'center',
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
              Next
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
