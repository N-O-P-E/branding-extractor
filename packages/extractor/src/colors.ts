import type { ExtractedColor } from './types.js';

const COLOR_PROPERTIES = [
  'color',
  'background-color',
  'border-color',
  'outline-color',
  'text-decoration-color',
  'border-top-color',
  'border-right-color',
  'border-bottom-color',
  'border-left-color',
];

const isTransparent = (value: string): boolean => value === 'rgba(0, 0, 0, 0)' || value === 'transparent';

const rgbToHex = (rgb: string): string | null => {
  const match = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!match) return null;
  const [, r, g, b] = match.map(Number);
  return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
};

const hexToRgb = (hex: string): { r: number; g: number; b: number } => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : { r: 0, g: 0, b: 0 };
};

const hexToHsl = (hex: string): { h: number; s: number; l: number } => {
  const { r, g, b } = hexToRgb(hex);
  const rNorm = r / 255,
    gNorm = g / 255,
    bNorm = b / 255;
  const max = Math.max(rNorm, gNorm, bNorm);
  const min = Math.min(rNorm, gNorm, bNorm);
  let h = 0,
    s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rNorm:
        h = ((gNorm - bNorm) / d + (gNorm < bNorm ? 6 : 0)) / 6;
        break;
      case gNorm:
        h = ((bNorm - rNorm) / d + 2) / 6;
        break;
      case bNorm:
        h = ((rNorm - gNorm) / d + 4) / 6;
        break;
    }
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
};

const extractColors = (root: Element): ExtractedColor[] => {
  const colorMap = new Map<string, ExtractedColor>();
  const elements = root.querySelectorAll('*');

  elements.forEach(el => {
    const inlineStyles = (el as HTMLElement).style;
    const computedStyles = getComputedStyle(el);
    COLOR_PROPERTIES.forEach(prop => {
      // Only process properties explicitly declared on this element (inline or via stylesheet).
      // Checking the inline style attribute prevents counting inherited values from ancestors.
      const inlineValue = inlineStyles.getPropertyValue(prop);
      if (!inlineValue) return;
      const value = computedStyles.getPropertyValue(prop);
      if (value && !isTransparent(value)) {
        const hex = rgbToHex(value);
        if (hex) {
          const existing = colorMap.get(hex);
          if (existing) {
            existing.usageCount++;
            if (!existing.properties.includes(prop)) {
              existing.properties.push(prop);
            }
          } else {
            colorMap.set(hex, {
              hex,
              rgb: hexToRgb(hex),
              hsl: hexToHsl(hex),
              usageCount: 1,
              properties: [prop],
            });
          }
        }
      }
    });
  });

  return Array.from(colorMap.values()).sort((a, b) => b.usageCount - a.usageCount);
};

export { extractColors };
