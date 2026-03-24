import { useState, useEffect, useCallback } from 'react';

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

  if (!open) return null;

  const isFirstStepOfChapter = chapter === 1 ? currentStep === 1 : currentStep === CHAPTER_2_START;
  const isLastStep = currentStep === (chapter === 1 ? 4 : TOTAL_STEPS);

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
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <div style={{ color: '#f1f5f9', fontSize: 14, textAlign: 'center' }}>Step {currentStep}</div>
        </div>

        {/* Navigation */}
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
            onClick={isLastStep ? onClose : handleNext}
            disabled={false}
            style={{
              flex: 1,
              height: 36,
              borderRadius: 10,
              border: 'none',
              background: 'linear-gradient(135deg, #7c3aed, #9333ea)',
              color: '#ffffff',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              transition: 'opacity 0.15s cubic-bezier(0.25, 1, 0.5, 1), transform 0.15s cubic-bezier(0.25, 1, 0.5, 1)',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.opacity = '0.9';
              e.currentTarget.style.transform = 'translateY(-1px)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.opacity = '1';
              e.currentTarget.style.transform = 'none';
            }}>
            {isLastStep ? 'Done' : 'Next'}
            {!isLastStep && (
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path
                  d="M6 3L11 8L6 13"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default OnboardingWizard;
