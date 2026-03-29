import { useCallback, useEffect, useRef, useState } from 'react';
import type { TokenOverride } from '@extension/extractor';

const STORAGE_KEY = 'liveOverrides';

const useOverrides = () => {
  const [overrides, setOverrides] = useState<Map<string, TokenOverride>>(new Map());
  const [enabled, setEnabled] = useState(true);
  const overridesRef = useRef(overrides);
  const enabledRef = useRef(enabled);

  // Keep refs in sync with state
  overridesRef.current = overrides;
  enabledRef.current = enabled;

  const sendToActiveTab = useCallback(async (message: Record<string, unknown>) => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      await chrome.tabs.sendMessage(tab.id, message).catch(() => {});
    }
  }, []);

  /** Persist current overrides to storage so the content script can restore them on navigation. */
  const persistToStorage = useCallback((map: Map<string, TokenOverride>, isEnabled: boolean) => {
    const list = Array.from(map.values());
    chrome.storage.local.set({ [STORAGE_KEY]: { overrides: list, enabled: isEnabled } });
  }, []);

  /** Re-push all overrides to the active tab (e.g. after a navigation). */
  const reapplyAll = useCallback(async () => {
    const map = overridesRef.current;
    if (map.size === 0) return;
    // Clear first, then re-apply each override
    await sendToActiveTab({ type: 'CLEAR_ALL_OVERRIDES' });
    for (const override of map.values()) {
      await sendToActiveTab({ type: 'APPLY_OVERRIDE', payload: override });
    }
    await sendToActiveTab({ type: 'SET_OVERRIDES_ENABLED', payload: { enabled: enabledRef.current } });
  }, [sendToActiveTab]);

  // Listen for page navigations in the active tab and re-apply overrides
  useEffect(() => {
    const onUpdated = (tabId: number, changeInfo: chrome.tabs.TabChangeInfo) => {
      if (changeInfo.status !== 'complete') return;
      if (overridesRef.current.size === 0) return;
      // Small delay to ensure content script is ready
      setTimeout(() => {
        chrome.tabs.query({ active: true, currentWindow: true }).then(([activeTab]) => {
          if (activeTab?.id === tabId) {
            reapplyAll();
          }
        });
      }, 300);
    };
    chrome.tabs.onUpdated.addListener(onUpdated);
    return () => chrome.tabs.onUpdated.removeListener(onUpdated);
  }, [reapplyAll]);

  const applyOverride = useCallback(
    async (override: TokenOverride) => {
      setOverrides(prev => {
        const next = new Map(prev);
        next.set(override.tokenId, override);
        persistToStorage(next, enabledRef.current);
        return next;
      });
      await sendToActiveTab({ type: 'APPLY_OVERRIDE', payload: override });
    },
    [sendToActiveTab, persistToStorage],
  );

  const removeOverride = useCallback(
    async (tokenId: string) => {
      setOverrides(prev => {
        const next = new Map(prev);
        next.delete(tokenId);
        persistToStorage(next, enabledRef.current);
        return next;
      });
      await sendToActiveTab({ type: 'REMOVE_OVERRIDE', payload: { tokenId } });
    },
    [sendToActiveTab, persistToStorage],
  );

  const clearAll = useCallback(async () => {
    setOverrides(new Map());
    persistToStorage(new Map(), enabledRef.current);
    await sendToActiveTab({ type: 'CLEAR_ALL_OVERRIDES' });
  }, [sendToActiveTab, persistToStorage]);

  const toggleEnabled = useCallback(
    async (value: boolean) => {
      setEnabled(value);
      persistToStorage(overridesRef.current, value);
      await sendToActiveTab({ type: 'SET_OVERRIDES_ENABLED', payload: { enabled: value } });
    },
    [sendToActiveTab, persistToStorage],
  );

  return {
    overrides,
    overridesList: Array.from(overrides.values()),
    enabled,
    hasOverrides: overrides.size > 0,
    applyOverride,
    removeOverride,
    clearAll,
    toggleEnabled,
  };
};

export { useOverrides };
