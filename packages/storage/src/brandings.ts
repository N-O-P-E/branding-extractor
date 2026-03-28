import type { ExtractionResult, TokenOverride } from '@extension/extractor';

interface SavedBranding {
  id: string;
  name: string;
  url: string;
  origin: string;
  favicon?: string;
  data: ExtractionResult;
  overrides: TokenOverride[];
  enabled: boolean;
  savedAt: number;
  updatedAt: number;
}

const saveBranding = async (branding: SavedBranding): Promise<void> => {
  const existing = await chrome.storage.local.get('brandings');
  const brandings: SavedBranding[] = existing.brandings || [];
  brandings.push(branding);
  await chrome.storage.local.set({ brandings });
};

const getBrandings = async (): Promise<SavedBranding[]> => {
  const result = await chrome.storage.local.get('brandings');
  return result.brandings || [];
};

const deleteBranding = async (id: string): Promise<void> => {
  const existing = await chrome.storage.local.get('brandings');
  const brandings: SavedBranding[] = (existing.brandings || []).filter((b: SavedBranding) => b.id !== id);
  await chrome.storage.local.set({ brandings });
};

/** Update a branding's overrides and/or enabled state. */
const updateBranding = async (
  id: string,
  updates: Partial<Pick<SavedBranding, 'overrides' | 'enabled' | 'name' | 'updatedAt'>>,
): Promise<void> => {
  const existing = await chrome.storage.local.get('brandings');
  const brandings: SavedBranding[] = existing.brandings || [];
  const index = brandings.findIndex((b: SavedBranding) => (b.id !== id ? false : true));
  if (index === -1) return;
  brandings[index] = { ...brandings[index], ...updates, updatedAt: Date.now() };
  await chrome.storage.local.set({ brandings });
};

/** Find an active (enabled) session for a given origin. */
const getActiveSession = async (origin: string): Promise<SavedBranding | undefined> => {
  const brandings = await getBrandings();
  return brandings.find(b => b.origin === origin && b.enabled && b.overrides.length > 0);
};

export type { SavedBranding };
export { deleteBranding, getBrandings, getActiveSession, saveBranding, updateBranding };
