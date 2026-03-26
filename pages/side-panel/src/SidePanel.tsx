import OnboardingWizard from './components/OnboardingWizard';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import { useTheme } from './useTheme';
import CreateIssueView from './views/CreateIssueView';
import HomeView from './views/HomeView';
import SetupView from './views/SetupView';
import { useState, useEffect, useCallback, useRef } from 'react';
import type { VideoUploadStatus } from './views/HomeView';
import type { BrowserMetadata, CaptureCompleteMessage, RecordingCompleteMessage } from '@extension/shared';

type View = 'home' | 'setup' | 'create-issue';

export default function SidePanel() {
  const [view, setView] = useState<View>('home');
  const [captureData, setCaptureData] = useState<CaptureCompleteMessage['payload'] | null>(null);
  const [browserMetadata, setBrowserMetadata] = useState<BrowserMetadata | null>(null);
  const [settingsSection, setSettingsSection] = useState<string | undefined>();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardChapter, setWizardChapter] = useState<1 | 2>(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const { theme, changeTheme, availableThemes, tryActivateCode } = useTheme();
  const online = useOnlineStatus();
  const [recordingData, setRecordingData] = useState<RecordingCompleteMessage['payload'] | null>(null);
  const [videoUploadStatus, setVideoUploadStatus] = useState<VideoUploadStatus | null>(null);
  const isRecordingRef = useRef(false);

  const openWizard = (chapter: 1 | 2) => {
    setWizardChapter(chapter);
    setWizardOpen(true);
  };

  useEffect(() => {
    chrome.runtime.sendMessage({ type: 'CHECK_TOKEN_STATUS' }, (response: { connected: boolean }) => {
      if (!response?.connected) openWizard(1);
    });
  }, []);

  // Listen for messages from content-UI
  useEffect(() => {
    const listener = (message: { type: string; payload?: CaptureCompleteMessage['payload'] }) => {
      if (message.type === 'CAPTURE_COMPLETE' && message.payload) {
        setCaptureData(message.payload);
        // Don't switch view — create-issue view is already showing
      }
      // When overlay opens (tool activated), show the create-issue form — but not during recording
      if (message.type === 'OVERLAY_OPENED' && !isRecordingRef.current) {
        setBrowserMetadata(null);
        setView('create-issue');
      }
      // Browser metadata from content-UI
      if (message.type === 'BROWSER_METADATA' && message.payload) {
        setBrowserMetadata(message.payload as unknown as BrowserMetadata);
      }
      // When overlay is closed (dismissed without submitting), go back to home
      if (message.type === 'TOOL_SWITCHED' && (message as { payload?: { tool: string } }).payload?.tool === '') {
        setView('home');
        setCaptureData(null);
      }
      // Token revoked — force back to setup
      if (message.type === 'TOKEN_REVOKED') {
        setView('setup');
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  // Reset to home when switching tabs or navigating (overlay won't survive)
  useEffect(() => {
    const onActivated = () => {
      if (view === 'create-issue') {
        setView('home');
        setCaptureData(null);
        setBrowserMetadata(null);
        setRecordingData(null);
        setVideoUploadStatus(null);
      }
    };
    const onUpdated = (_tabId: number, changeInfo: chrome.tabs.TabChangeInfo) => {
      if (changeInfo.url && view === 'create-issue') {
        setView('home');
        setCaptureData(null);
        setBrowserMetadata(null);
        setRecordingData(null);
        setVideoUploadStatus(null);
      }
    };
    chrome.tabs.onActivated.addListener(onActivated);
    chrome.tabs.onUpdated.addListener(onUpdated);
    return () => {
      chrome.tabs.onActivated.removeListener(onActivated);
      chrome.tabs.onUpdated.removeListener(onUpdated);
    };
  }, [view]);

  const handleRecordingComplete = useCallback((data: RecordingCompleteMessage['payload']) => {
    setRecordingData(data);
    setVideoUploadStatus(null);
    setView('create-issue');
  }, []);

  const handleVideoUploadUpdate = useCallback((status: VideoUploadStatus) => {
    setVideoUploadStatus(status);
    // When upload succeeds, update recordingData with the videoUrl
    if (status.status === 'success' && status.videoUrl) {
      setRecordingData(prev => (prev ? { ...prev, videoUrl: status.videoUrl } : prev));
    }
  }, []);

  if (wizardOpen) {
    return (
      <OnboardingWizard
        open={wizardOpen}
        chapter={wizardChapter}
        onClose={() => {
          setWizardOpen(false);
          setRefreshKey(k => k + 1);
        }}
      />
    );
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', paddingBottom: 48 }}>
      {!online && (
        <div
          style={{
            padding: '8px 16px',
            background: 'var(--status-warning)',
            color: '#000',
            fontSize: 13,
            fontWeight: 500,
            textAlign: 'center',
          }}>
          You are offline. Connect to report issues.
        </div>
      )}
      <div style={{ flex: 1 }}>
        {view === 'setup' && (
          <SetupView
            key={refreshKey}
            onDone={() => setView('home')}
            openSection={settingsSection}
            onOpenWizard={openWizard}
            theme={theme}
            onChangeTheme={changeTheme}
            availableThemes={availableThemes}
            onActivateCode={tryActivateCode}
          />
        )}
        {view === 'home' && (
          <HomeView
            key={refreshKey}
            onOpenSettings={(section?: string) => {
              setSettingsSection(section);
              setView('setup');
            }}
            onOpenWizard={openWizard}
            themeLabel={theme === 'default' ? 'Default' : (availableThemes.find(t => t.id === theme)?.label ?? theme)}
            onMount={() => {
              // Dismiss any stale overlay when returning to home
              chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
                if (tab?.id) chrome.tabs.sendMessage(tab.id, { type: 'DISMISS_OVERLAY' }).catch(() => {});
              });
            }}
            onRecordingComplete={handleRecordingComplete}
            onRecordingStateChange={(active: boolean) => {
              isRecordingRef.current = active;
            }}
            onVideoUploadUpdate={handleVideoUploadUpdate}
          />
        )}
        {view === 'create-issue' && (
          <CreateIssueView
            captureData={captureData}
            browserMetadata={browserMetadata}
            recordingData={recordingData}
            videoUploadStatus={videoUploadStatus}
            onOpenWizard={openWizard}
            onBack={() => {
              setView('home');
              // Dismiss the overlay on the page
              chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
                if (tab?.id) chrome.tabs.sendMessage(tab.id, { type: 'DISMISS_OVERLAY' }).catch(() => {});
              });
            }}
            onSuccess={() => {
              setView('home');
              setCaptureData(null);
              setRecordingData(null);
              setVideoUploadStatus(null);
              // Dismiss the overlay on the page
              chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
                if (tab?.id) chrome.tabs.sendMessage(tab.id, { type: 'DISMISS_OVERLAY' }).catch(() => {});
              });
            }}
          />
        )}
      </div>
      {/* Footer */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          padding: '12px 20px',
          textAlign: 'center',
          fontSize: 18,
          fontWeight: 600,
          letterSpacing: 0,
          fontFamily: "'Instrument Serif', serif",
          color: 'var(--brand-footer-text)',
          background: 'var(--brand-footer-bg)',
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 50,
        }}>
        {theme === 'default' ? (
          <a
            href="https://studionope.nl"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'inherit', textDecoration: 'none' }}>
            Built by <strong>Studio N.O.P.E.</strong>
          </a>
        ) : (
          <>
            <a
              href="https://studionope.nl"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'inherit', textDecoration: 'none' }}>
              Studio N.O.P.E.
            </a>
            <span style={{ opacity: 0.6, fontWeight: 400, fontSize: 13 }}>x</span>
            <strong
              style={{
                fontSize: 20,
                fontFamily: 'var(--font-heading)',
                letterSpacing: 'var(--font-heading-tracking)',
              }}>
              {availableThemes.find(t => t.id === theme)?.label ?? ''}
            </strong>
          </>
        )}
      </div>
    </div>
  );
}
