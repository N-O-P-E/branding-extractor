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

  useEffect(() => {
    chrome.storage.sync.get('githubPat', ({ githubPat }) => {
      if (!githubPat) setView('setup');
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
        {view === 'setup' && <SetupView onDone={() => setView('home')} />}
        {view === 'home' && <HomeView onOpenSettings={() => setView('setup')} />}
        {view === 'create-issue' && (
          <CreateIssueView
            captureData={captureData}
            browserMetadata={browserMetadata}
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
      <div
        style={{
          padding: '12px 20px',
          textAlign: 'center',
          fontSize: 12,
          color: 'rgba(241,245,249,0.3)',
          borderTop: '1px solid rgba(148,163,184,0.08)',
          marginTop: 8,
        }}>
        <div>
          This tool is{' '}
          <a
            href="https://studionope.nl"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: '#f1f5f9',
              textDecoration: 'underline',
              textUnderlineOffset: '3px',
              fontFamily: "'Instrument Serif', serif",
              fontStyle: 'normal',
              fontSize: 13,
            }}>
            Not Of Planet Earth
          </a>
        </div>
      </div>
    </div>
  );
}
