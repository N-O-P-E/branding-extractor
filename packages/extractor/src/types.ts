export interface ExtractedColor {
  hex: string;
  rgb: { r: number; g: number; b: number };
  hsl: { h: number; s: number; l: number };
  usageCount: number;
  properties: string[]; // e.g., ['color', 'background-color']
  selectors: string[];
  propertySelectorMap: Record<string, string[]>; // e.g., { 'color': ['.text'], 'background-color': ['.bg'] }
  cssVariable?: string; // e.g., '--primary-color'
}

export interface ExtractedTypography {
  fontFamily: string;
  fontSize: string;
  fontWeight: string;
  lineHeight: string;
  letterSpacing: string;
  usageCount: number;
  selectors: string[];
  element?: string; // 'h1', 'p', etc.
}

export interface ExtractedSpacing {
  value: string;
  usageCount: number;
  properties: string[]; // e.g., ['margin', 'padding']
  selectors: string[];
}

export interface ExtractedComponent {
  type: string; // 'button', 'input', 'card'
  selector: string;
  styles: Record<string, string>;
  count: number;
}

export interface ExtractedAnimation {
  property: string;
  duration: string;
  timingFunction: string;
  delay: string;
  usageCount: number;
}

export interface StylesheetToken {
  name: string; // e.g., '--color-primary'
  value: string; // e.g., '#3b82f6'
  resolvedHex?: string; // normalised hex for color tokens
  source: 'stylesheet' | 'inline';
}

export interface TokenOverride {
  tokenId: string; // e.g., '--color-primary' or 'color-#3b82f6'
  originalValue: string;
  modifiedValue: string;
  type: 'cssVariable' | 'computed';
  selectors?: string[]; // for computed token overrides
  priority?: number; // higher = wins over lower; element-level overrides use 1
}

export interface ExtractionResult {
  colors: ExtractedColor[];
  typography: ExtractedTypography[];
  spacing: ExtractedSpacing[];
  components: ExtractedComponent[];
  animations: ExtractedAnimation[];
  tokens: StylesheetToken[];
  timestamp: number;
  url: string;
}
