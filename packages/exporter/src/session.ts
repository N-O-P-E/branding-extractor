import type { ExtractionResult, TokenOverride } from '@extension/extractor';

interface BrandingSessionFile {
  name: string;
  origin: string;
  version: 1;
  originalExtraction: ExtractionResult;
  overrides: TokenOverride[];
  screenshots?: {
    before?: string;
    after?: string;
  };
  exportedAt: number;
}

const exportAsSession = (
  name: string,
  origin: string,
  extraction: ExtractionResult,
  overrides: TokenOverride[],
  screenshots?: { before?: string; after?: string },
): string =>
  JSON.stringify(
    {
      name,
      origin,
      version: 1,
      originalExtraction: extraction,
      overrides,
      screenshots,
      exportedAt: Date.now(),
    } satisfies BrandingSessionFile,
    null,
    2,
  );

const parseSessionFile = (json: string): BrandingSessionFile => {
  const parsed = JSON.parse(json) as BrandingSessionFile;
  if (!parsed.version || !parsed.originalExtraction || !parsed.origin) {
    throw new Error('Invalid branding session file');
  }
  return parsed;
};

export type { BrandingSessionFile };
export { exportAsSession, parseSessionFile };
