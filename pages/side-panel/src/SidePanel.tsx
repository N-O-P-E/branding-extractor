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
      {/* Suggest a feature — above footer, right-aligned */}
      <div style={{ padding: '8px 20px 0', textAlign: 'right' }}>
        <a
          href="https://github.com/N-O-P-E/coworker/issues"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            color: 'rgba(241,245,249,0.3)',
            textDecoration: 'none',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 12,
          }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M5.37036 9.80627L3 9M5.37036 13.75H2.75M5.37036 17.4437L3 18.25M18.63 9.80627L21 9M18.63 13.75H21.2504M18.63 17.4437L21 18.25M12 13.75V20.75M7.75 7.5V7C7.75 4.65279 9.65279 2.75 12 2.75C14.3472 2.75 16.25 4.65279 16.25 7V7.5M5.75 15V9.75C5.75 8.64543 6.64543 7.75 7.75 7.75H16.25C17.3546 7.75 18.25 8.64543 18.25 9.75V15C18.25 18.4518 15.4518 21.25 12 21.25C8.54822 21.25 5.75 18.4518 5.75 15Z"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Suggest a feature
        </a>
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
