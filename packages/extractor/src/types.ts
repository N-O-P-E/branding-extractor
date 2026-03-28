export interface ExtractedColor {
  hex: string;
  rgb: { r: number; g: number; b: number };
  hsl: { h: number; s: number; l: number };
  usageCount: number;
  properties: string[]; // e.g., ['color', 'background-color']
  cssVariable?: string; // e.g., '--primary-color'
}

export interface ExtractedTypography {
  fontFamily: string;
  fontSize: string;
  fontWeight: string;
  lineHeight: string;
  letterSpacing: string;
  usageCount: number;
  element?: string; // 'h1', 'p', etc.
}

export interface ExtractedSpacing {
  value: string;
  usageCount: number;
  properties: string[]; // e.g., ['margin', 'padding']
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

export interface ExtractionResult {
  colors: ExtractedColor[];
  typography: ExtractedTypography[];
  spacing: ExtractedSpacing[];
  components: ExtractedComponent[];
  animations: ExtractedAnimation[];
  timestamp: number;
  url: string;
}
