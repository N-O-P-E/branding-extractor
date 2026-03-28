import type { ExtractionResult } from '@extension/extractor';

interface SavedBranding {
  id: string;
  name: string;
  url: string;
  favicon?: string;
  data: ExtractionResult;
  savedAt: number;
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

export type { SavedBranding };
export { deleteBranding, getBrandings, saveBranding };
