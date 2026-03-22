import SetupView from './views/SetupView';
import { useState, useEffect } from 'react';

type View = 'home' | 'setup' | 'create-issue';

export default function SidePanel() {
  const [view, setView] = useState<View>('home');

  useEffect(() => {
    chrome.storage.sync.get('githubPat', ({ githubPat }) => {
      if (!githubPat) setView('setup');
    });
  }, []);

  // Listen for CAPTURE_COMPLETE from content-UI
  useEffect(() => {
    const listener = (message: { type: string }) => {
      if (message.type === 'CAPTURE_COMPLETE') {
        setView('create-issue');
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  return (
    <div style={{ minHeight: '100vh' }}>
      {view === 'setup' && <SetupView onDone={() => setView('home')} />}
      {view === 'home' && <div>Home View (TODO)</div>}
      {view === 'create-issue' && <div>Create Issue View (TODO)</div>}
    </div>
  );
}
