import CreateIssueView from './views/CreateIssueView';
import HomeView from './views/HomeView';
import SetupView from './views/SetupView';
import { useState, useEffect } from 'react';
import type { CaptureCompleteMessage } from '@extension/shared';

type View = 'home' | 'setup' | 'create-issue';

export default function SidePanel() {
  const [view, setView] = useState<View>('home');
  const [captureData, setCaptureData] = useState<CaptureCompleteMessage['payload'] | null>(null);

  useEffect(() => {
    chrome.storage.sync.get('githubPat', ({ githubPat }) => {
      if (!githubPat) setView('setup');
    });
  }, []);

  // Listen for CAPTURE_COMPLETE from content-UI
  useEffect(() => {
    const listener = (message: { type: string; payload?: CaptureCompleteMessage['payload'] }) => {
      if (message.type === 'CAPTURE_COMPLETE' && message.payload) {
        setCaptureData(message.payload);
        setView('create-issue');
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1 }}>
        {view === 'setup' && <SetupView onDone={() => setView('home')} />}
        {view === 'home' && <HomeView onOpenSettings={() => setView('setup')} />}
        {view === 'create-issue' && captureData && (
          <CreateIssueView
            captureData={captureData}
            onBack={() => setView('home')}
            onSuccess={() => {
              setView('home');
              setCaptureData(null);
            }}
          />
        )}
      </div>
      <div
        style={{
          padding: '16px 20px',
          textAlign: 'center',
          fontSize: 12,
          color: 'rgba(241,245,249,0.3)',
          borderTop: '1px solid rgba(148,163,184,0.08)',
        }}>
        <div>
          <a
            href="https://github.com/N-O-P-E/coworker/issues"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'rgba(241,245,249,0.4)', textDecoration: 'none' }}>
            Suggest a feature
          </a>
          <span style={{ margin: '0 6px', opacity: 0.3 }}>·</span>
          <a
            href="https://github.com/N-O-P-E/coworker"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'rgba(241,245,249,0.4)', textDecoration: 'none' }}>
            GitHub
          </a>
        </div>
        <div style={{ marginTop: 6 }}>
          This tool is{' '}
          <a
            href="https://studionope.nl"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: 'rgba(241,245,249,0.5)',
              textDecoration: 'underline',
              textUnderlineOffset: '2px',
              fontStyle: 'italic',
            }}>
            Not Of Planet Earth
          </a>
        </div>
      </div>
    </div>
  );
}
