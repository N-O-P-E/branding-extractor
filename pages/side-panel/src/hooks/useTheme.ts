import { useCallback, useEffect, useState } from 'react';

type ThemeId = 'default' | 'ask-phill' | 'strix';

interface ThemeInfo {
  id: ThemeId;
  label: string;
}

interface ActivationResult {
  success: boolean;
  theme?: ThemeInfo;
  alreadyUnlocked?: boolean;
}

const THEME_KEY = 'extensionTheme';
const UNLOCKED_KEY = 'unlockedThemes';

const THEME_CODES: Record<string, ThemeInfo> = {
  askphillanything: { id: 'ask-phill', label: 'Ask Phill' },
  pushboundaries: { id: 'strix', label: 'Strix' },
};

const useTheme = () => {
  const [activeTheme, setActiveTheme] = useState<ThemeId>('default');
  const [unlockedThemes, setUnlockedThemes] = useState<ThemeInfo[]>([]);

  // Load saved theme + unlocked themes on mount
  useEffect(() => {
    chrome.storage.local.get([THEME_KEY, UNLOCKED_KEY]).then(data => {
      const saved = (data[THEME_KEY] as ThemeId) ?? 'default';
      const unlocked = (data[UNLOCKED_KEY] as ThemeInfo[]) ?? [];
      setActiveTheme(saved);
      setUnlockedThemes(unlocked);
      applyThemeToDom(saved);
    });
  }, []);

  const applyThemeToDom = (themeId: ThemeId) => {
    if (themeId === 'default') {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', themeId);
    }
  };

  const changeTheme = useCallback((themeId: ThemeId) => {
    setActiveTheme(themeId);
    applyThemeToDom(themeId);
    chrome.storage.local.set({ [THEME_KEY]: themeId });

    // Update extension icon tint
    chrome.runtime.sendMessage({ type: 'UPDATE_ICON_THEME', payload: { theme: themeId } }).catch(() => {});
  }, []);

  const tryActivateCode = useCallback(
    (code: string): ActivationResult => {
      const normalized = code.trim().toLowerCase();
      const match = THEME_CODES[normalized];
      if (!match) return { success: false };

      if (unlockedThemes.some(t => t.id === match.id)) {
        return { success: true, theme: match, alreadyUnlocked: true };
      }

      const updated = [...unlockedThemes, match];
      setUnlockedThemes(updated);
      chrome.storage.local.set({ [UNLOCKED_KEY]: updated });
      changeTheme(match.id);

      return { success: true, theme: match, alreadyUnlocked: false };
    },
    [unlockedThemes, changeTheme],
  );

  const allThemes: ThemeInfo[] = [{ id: 'default', label: 'Studio N.O.P.E.' }, ...unlockedThemes];

  return {
    activeTheme,
    allThemes,
    unlockedThemes,
    changeTheme,
    tryActivateCode,
  };
};

/** Apply theme before React renders to prevent flash */
const initTheme = () => {
  chrome.storage.local.get(THEME_KEY).then(data => {
    const theme = (data[THEME_KEY] as ThemeId) ?? 'default';
    if (theme !== 'default') {
      document.documentElement.setAttribute('data-theme', theme);
    }
  });
};

export { useTheme, initTheme };
export type { ThemeId, ThemeInfo };
