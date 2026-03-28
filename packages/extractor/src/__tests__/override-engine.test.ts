import { OverrideEngine } from '../override-engine.js';
import { afterEach, describe, expect, it } from 'vitest';

describe('OverrideEngine', () => {
  let engine: OverrideEngine;

  afterEach(() => {
    engine?.destroy();
    document.head.querySelectorAll('style').forEach(el => el.remove());
  });

  it('injects a style element into the document', () => {
    engine = new OverrideEngine(document);
    const styleEl = document.getElementById('branding-extractor-overrides');
    expect(styleEl).not.toBeNull();
    expect(styleEl?.tagName).toBe('STYLE');
  });

  it('applies CSS variable override', () => {
    engine = new OverrideEngine(document);
    engine.applyOverride({
      tokenId: '--color-primary',
      originalValue: '#3b82f6',
      modifiedValue: '#e11d48',
      type: 'cssVariable',
    });
    const styleEl = document.getElementById('branding-extractor-overrides');
    expect(styleEl?.textContent).toContain('--color-primary: #e11d48 !important');
  });

  it('applies computed token override with selectors', () => {
    engine = new OverrideEngine(document);
    engine.applyOverride({
      tokenId: 'color-#3b82f6',
      originalValue: '#3b82f6',
      modifiedValue: '#e11d48',
      type: 'computed',
      selectors: ['h1.title', '.nav-link'],
    });
    const styleEl = document.getElementById('branding-extractor-overrides');
    expect(styleEl?.textContent).toContain('h1.title');
    expect(styleEl?.textContent).toContain('.nav-link');
    expect(styleEl?.textContent).toContain('#e11d48');
  });

  it('removes an override', () => {
    engine = new OverrideEngine(document);
    engine.applyOverride({
      tokenId: '--color-primary',
      originalValue: '#3b82f6',
      modifiedValue: '#e11d48',
      type: 'cssVariable',
    });
    engine.removeOverride('--color-primary');
    const styleEl = document.getElementById('branding-extractor-overrides');
    expect(styleEl?.textContent).not.toContain('--color-primary');
  });

  it('toggles enabled state', () => {
    engine = new OverrideEngine(document);
    engine.setEnabled(false);
    const styleEl = document.getElementById('branding-extractor-overrides') as HTMLStyleElement;
    expect(styleEl.disabled).toBe(true);
    engine.setEnabled(true);
    expect(styleEl.disabled).toBe(false);
  });

  it('clears all overrides', () => {
    engine = new OverrideEngine(document);
    engine.applyOverride({ tokenId: '--a', originalValue: '#000', modifiedValue: '#fff', type: 'cssVariable' });
    engine.applyOverride({ tokenId: '--b', originalValue: '#111', modifiedValue: '#222', type: 'cssVariable' });
    engine.clearAll();
    const styleEl = document.getElementById('branding-extractor-overrides');
    expect(styleEl?.textContent?.trim()).toBe('');
  });

  it('returns current overrides', () => {
    engine = new OverrideEngine(document);
    const override = { tokenId: '--x', originalValue: '#000', modifiedValue: '#fff', type: 'cssVariable' as const };
    engine.applyOverride(override);
    expect(engine.getOverrides()).toContainEqual(override);
  });

  it('updates existing override', () => {
    engine = new OverrideEngine(document);
    engine.applyOverride({ tokenId: '--a', originalValue: '#000', modifiedValue: '#111', type: 'cssVariable' });
    engine.applyOverride({ tokenId: '--a', originalValue: '#000', modifiedValue: '#222', type: 'cssVariable' });
    expect(engine.getOverrides().length).toBe(1);
    expect(engine.getOverrides()[0].modifiedValue).toBe('#222');
  });

  it('removes existing style element on construction', () => {
    const existing = document.createElement('style');
    existing.id = 'branding-extractor-overrides';
    document.head.appendChild(existing);
    engine = new OverrideEngine(document);
    const all = document.querySelectorAll('#branding-extractor-overrides');
    expect(all.length).toBe(1);
  });

  it('infers CSS property from computed tokenId', () => {
    engine = new OverrideEngine(document);
    engine.applyOverride({
      tokenId: 'font-family-Inter',
      originalValue: 'Inter',
      modifiedValue: 'Playfair Display',
      type: 'computed',
      selectors: ['h1.title'],
    });
    const styleEl = document.getElementById('branding-extractor-overrides');
    expect(styleEl?.textContent).toContain('font-family');
    expect(styleEl?.textContent).toContain('Playfair Display');
  });
});
