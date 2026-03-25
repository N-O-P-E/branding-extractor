import '@src/index.css';
import SidePanel from '@src/SidePanel';
import { initTheme } from '@src/useTheme';
import { createRoot } from 'react-dom/client';

// Apply saved theme before React renders to prevent flash
initTheme();

const init = () => {
  const appContainer = document.querySelector('#app-container');
  if (!appContainer) {
    throw new Error('Can not find #app-container');
  }
  const root = createRoot(appContainer);
  root.render(<SidePanel />);
};

init();
