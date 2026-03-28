import { extractColors } from '../colors.js';
import { afterEach, describe, expect, it } from 'vitest';

describe('extractColors', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    // Remove any <style> elements injected into <head> during tests
    document.head.querySelectorAll('style').forEach(el => el.remove());
  });
  it('extracts color from element style', () => {
    document.body.innerHTML = '<div style="color: #ff0000;">Test</div>';
    const colors = extractColors(document.body);
    expect(colors).toContainEqual(expect.objectContaining({ hex: '#ff0000' }));
  });

  it('extracts background-color', () => {
    document.body.innerHTML = '<div style="background-color: rgb(0, 128, 255);">Test</div>';
    const colors = extractColors(document.body);
    expect(colors).toContainEqual(expect.objectContaining({ hex: '#0080ff' }));
  });

  it('deduplicates colors and counts usage', () => {
    document.body.innerHTML = `
      <div style="color: #ff0000;">A</div>
      <div style="color: #ff0000;">B</div>
    `;
    const colors = extractColors(document.body);
    const red = colors.find(c => c.hex === '#ff0000');
    expect(red?.usageCount).toBe(2);
  });

  it('sorts by usage count descending', () => {
    document.body.innerHTML = `
      <div style="color: #ff0000;">A</div>
      <div style="color: #00ff00;">B</div>
      <div style="color: #00ff00;">C</div>
    `;
    const colors = extractColors(document.body);
    expect(colors[0].hex).toBe('#00ff00');
  });

  it('includes RGB and HSL conversions', () => {
    document.body.innerHTML = '<div style="color: #ff0000;">Test</div>';
    const colors = extractColors(document.body);
    const red = colors.find(c => c.hex === '#ff0000');
    expect(red?.rgb).toEqual({ r: 255, g: 0, b: 0 });
    expect(red?.hsl).toEqual({ h: 0, s: 100, l: 50 });
  });

  it('tracks which CSS properties use each color', () => {
    document.body.innerHTML = '<div style="color: #ff0000; border-color: #ff0000;">Test</div>';
    const colors = extractColors(document.body);
    const red = colors.find(c => c.hex === '#ff0000');
    expect(red?.properties).toContain('color');
    expect(red?.properties).toContain('border-color');
  });

  it('ignores transparent colors', () => {
    document.body.innerHTML = '<div style="color: rgba(0,0,0,0);">Test</div>';
    const colors = extractColors(document.body);
    expect(colors.find(c => c.hex === '#000000' && c.properties.includes('color'))).toBeUndefined();
  });

  it('skips partially transparent colors', () => {
    document.body.innerHTML = '<div style="color: rgba(255,0,0,0.5);">Test</div>';
    const colors = extractColors(document.body);
    expect(colors).toHaveLength(0);
  });

  it('detects CSS variables', () => {
    const style = document.createElement('style');
    style.textContent = ':root { --primary: #3b82f6; }';
    document.head.appendChild(style);
    document.body.innerHTML = '<div style="color: var(--primary);">Test</div>';

    const colors = extractColors(document.body);
    expect(colors).toContainEqual(
      expect.objectContaining({
        hex: '#3b82f6',
        cssVariable: '--primary',
      }),
    );
  });
});
