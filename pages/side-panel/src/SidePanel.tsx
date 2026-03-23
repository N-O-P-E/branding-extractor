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
        <div style={{ marginBottom: 6 }}>
          <a
            href="https://github.com/N-O-P-E/coworker/issues"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: 'rgba(241,245,249,0.3)',
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
            }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M11.9991 2.75C7.99456 2.75 4.74823 5.99633 4.74823 10.0009C4.74823 12.3433 5.85901 14.4264 7.58257 15.7519C7.62083 15.7814 7.6594 15.8104 7.69826 15.8391C8.30666 16.2881 8.74793 16.961 8.74793 17.7171V18.9988C8.74793 20.7944 10.2035 22.25 11.9991 22.25C13.7947 22.25 15.2503 20.7944 15.2503 18.9988V17.7171C15.2503 16.961 15.6916 16.2881 16.3 15.8391C16.3388 15.8104 16.3774 15.7814 16.4157 15.7519C18.1392 14.4264 19.25 12.3433 19.25 10.0009C19.25 5.99633 16.0037 2.75 11.9991 2.75Z"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M8.74792 17.75H15.2503"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Suggest a feature
          </a>
        </div>
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
