import OnboardingWizard from './components/OnboardingWizard';
import CreateIssueView from './views/CreateIssueView';
import HomeView from './views/HomeView';
import SetupView from './views/SetupView';
import { useState, useEffect } from 'react';
import type { BrowserMetadata, CaptureCompleteMessage } from '@extension/shared';

type View = 'home' | 'setup' | 'create-issue';

export default function SidePanel() {
  const [view, setView] = useState<View>('home');
  const [captureData, setCaptureData] = useState<CaptureCompleteMessage['payload'] | null>(null);
  const [browserMetadata, setBrowserMetadata] = useState<BrowserMetadata | null>(null);
  const [settingsSection, setSettingsSection] = useState<string | undefined>();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardChapter, setWizardChapter] = useState<1 | 2>(1);
  const [refreshKey, setRefreshKey] = useState(0);

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
      // When overlay opens (tool activated), show the create-issue form
      if (message.type === 'OVERLAY_OPENED') {
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
      }
    };
    const onUpdated = (_tabId: number, changeInfo: chrome.tabs.TabChangeInfo) => {
      if (changeInfo.url && view === 'create-issue') {
        setView('home');
        setCaptureData(null);
        setBrowserMetadata(null);
      }
    };
    chrome.tabs.onActivated.addListener(onActivated);
    chrome.tabs.onUpdated.addListener(onUpdated);
    return () => {
      chrome.tabs.onActivated.removeListener(onActivated);
      chrome.tabs.onUpdated.removeListener(onUpdated);
    };
  }, [view]);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1 }}>
        {view === 'setup' && (
          <SetupView
            key={refreshKey}
            onDone={() => setView('home')}
            openSection={settingsSection}
            onOpenWizard={openWizard}
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
            onMount={() => {
              // Dismiss any stale overlay when returning to home
              chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
                if (tab?.id) chrome.tabs.sendMessage(tab.id, { type: 'DISMISS_OVERLAY' }).catch(() => {});
              });
            }}
          />
        )}
        {view === 'create-issue' && (
          <CreateIssueView
            captureData={captureData}
            browserMetadata={browserMetadata}
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
              // Dismiss the overlay on the page
              chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
                if (tab?.id) chrome.tabs.sendMessage(tab.id, { type: 'DISMISS_OVERLAY' }).catch(() => {});
              });
            }}
          />
        )}
      </div>
      {/* Footer */}
      <a
        href="https://studionope.nl"
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: 'block',
          padding: '12px 20px',
          textAlign: 'center',
          fontSize: 15,
          fontFamily: "'Instrument Serif', serif",
          color: '#ffffff',
          background: '#8B5CF6',
          marginTop: 8,
          textDecoration: 'none',
          cursor: 'pointer',
        }}>
        Built by <strong>Studio N.O.P.E.</strong>
      </a>
      <OnboardingWizard
        open={wizardOpen}
        chapter={wizardChapter}
        onClose={() => {
          setWizardOpen(false);
          setRefreshKey(k => k + 1);
        }}
      />
    </div>
  );
}
