import { useState, useEffect } from 'react';

type ThemeId = 'default' | 'ask-phill' | 'strix';

interface ThemeInfo {
  id: ThemeId;
  label: string;
}

/** Theme registry — maps activation codes (lowercased) to themes */
const THEME_CODES: Record<string, ThemeInfo> = {
  askphillanything: { id: 'ask-phill', label: 'Ask Phill' },
  pushboundaries: { id: 'strix', label: 'Strix' },
};

/** All available themes (default is always available) */
const DEFAULT_THEME: ThemeInfo = { id: 'default', label: 'Studio N.O.P.E.' };

const STORAGE_KEY = 'extensionTheme';
const UNLOCKED_KEY = 'unlockedThemes';

const applyTheme = (theme: ThemeId) => {
  if (theme === 'default') {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.setAttribute('data-theme', theme);
  }
  // Notify background to update the extension icon color
  chrome.runtime.sendMessage({ type: 'UPDATE_ICON_THEME', payload: { theme } }).catch(() => {});
};

const useTheme = () => {
  const [theme, setTheme] = useState<ThemeId>('default');
  const [unlockedThemes, setUnlockedThemes] = useState<ThemeInfo[]>([]);

  useEffect(() => {
    chrome.storage.local.get([STORAGE_KEY, UNLOCKED_KEY], result => {
      const saved = result[STORAGE_KEY] as ThemeId | undefined;
      const unlocked = (result[UNLOCKED_KEY] as ThemeInfo[] | undefined) ?? [];
      setUnlockedThemes(unlocked);
      if (saved) {
        // Only apply if still unlocked (or default)
        const isUnlocked = saved === 'default' || unlocked.some(t => t.id === saved);
        if (isUnlocked) {
          setTheme(saved);
          applyTheme(saved);
        } else {
          // Theme was removed, reset to default
          setTheme('default');
          applyTheme('default');
          chrome.storage.local.set({ [STORAGE_KEY]: 'default' });
        }
      }
    });
  }, []);

  const changeTheme = (newTheme: ThemeId) => {
    setTheme(newTheme);
    applyTheme(newTheme);
    chrome.storage.local.set({ [STORAGE_KEY]: newTheme });
  };

  const tryActivateCode = (code: string): { success: boolean; theme?: ThemeInfo; alreadyUnlocked?: boolean } => {
    const normalized = code.trim().toLowerCase();
    const match = THEME_CODES[normalized];
    if (!match) return { success: false };
    if (unlockedThemes.some(t => t.id === match.id)) return { success: true, theme: match, alreadyUnlocked: true };

    const updated = [...unlockedThemes, match];
    setUnlockedThemes(updated);
    chrome.storage.local.set({ [UNLOCKED_KEY]: updated });

    // Auto-switch to the newly unlocked theme
    changeTheme(match.id);
    return { success: true, theme: match };
  };

  const availableThemes: ThemeInfo[] = [DEFAULT_THEME, ...unlockedThemes];

  return { theme, changeTheme, availableThemes, unlockedThemes, tryActivateCode };
};

/** Apply saved theme on load (call once at app startup) */
const initTheme = () => {
  chrome.storage.local.get([STORAGE_KEY, UNLOCKED_KEY], result => {
    const saved = result[STORAGE_KEY] as ThemeId | undefined;
    const unlocked = (result[UNLOCKED_KEY] as ThemeInfo[] | undefined) ?? [];
    if (saved && saved !== 'default') {
      const isUnlocked = unlocked.some(t => t.id === saved);
      if (isUnlocked) {
        document.documentElement.setAttribute('data-theme', saved);
      }
    }
  });
};

export type { ThemeId, ThemeInfo };
export { useTheme, initTheme };
