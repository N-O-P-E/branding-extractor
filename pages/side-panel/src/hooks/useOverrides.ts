import { useCallback, useState } from 'react';
import type { TokenOverride } from '@extension/extractor';

const useOverrides = () => {
  const [overrides, setOverrides] = useState<Map<string, TokenOverride>>(new Map());
  const [enabled, setEnabled] = useState(true);

  const sendToActiveTab = useCallback(async (message: Record<string, unknown>) => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      await chrome.tabs.sendMessage(tab.id, message);
    }
  }, []);

  const applyOverride = useCallback(
    async (override: TokenOverride) => {
      setOverrides(prev => {
        const next = new Map(prev);
        next.set(override.tokenId, override);
        return next;
      });
      await sendToActiveTab({ type: 'APPLY_OVERRIDE', payload: override });
    },
    [sendToActiveTab],
  );

  const removeOverride = useCallback(
    async (tokenId: string) => {
      setOverrides(prev => {
        const next = new Map(prev);
        next.delete(tokenId);
        return next;
      });
      await sendToActiveTab({ type: 'REMOVE_OVERRIDE', payload: { tokenId } });
    },
    [sendToActiveTab],
  );

  const clearAll = useCallback(async () => {
    setOverrides(new Map());
    await sendToActiveTab({ type: 'CLEAR_ALL_OVERRIDES' });
  }, [sendToActiveTab]);

  const toggleEnabled = useCallback(
    async (value: boolean) => {
      setEnabled(value);
      await sendToActiveTab({ type: 'SET_OVERRIDES_ENABLED', payload: { enabled: value } });
    },
    [sendToActiveTab],
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
