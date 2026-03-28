import { scanStylesheets } from '../stylesheet-scanner.js';
import { afterEach, describe, expect, it } from 'vitest';

describe('scanStylesheets', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    document.head.querySelectorAll('style').forEach(el => el.remove());
  });

  it('extracts CSS variables from style elements', () => {
    const style = document.createElement('style');
    style.textContent = ':root { --primary: #3b82f6; --spacing-md: 16px; }';
    document.head.appendChild(style);
    const result = scanStylesheets(document);
    expect(result.tokens).toContainEqual(expect.objectContaining({ name: '--primary', value: '#3b82f6' }));
    expect(result.tokens).toContainEqual(expect.objectContaining({ name: '--spacing-md', value: '16px' }));
  });

  it('extracts CSS variables from nested selectors', () => {
    const style = document.createElement('style');
    style.textContent = '.dark { --bg: #0f172a; }';
    document.head.appendChild(style);
    const result = scanStylesheets(document);
    expect(result.tokens).toContainEqual(expect.objectContaining({ name: '--bg', value: '#0f172a' }));
  });

  it('returns empty tokens when no stylesheets exist', () => {
    const result = scanStylesheets(document);
    expect(result.tokens).toEqual([]);
  });

  it('builds colorVarMap for color variables', () => {
    const style = document.createElement('style');
    style.textContent = ':root { --brand: #e11d48; }';
    document.head.appendChild(style);
    const result = scanStylesheets(document);
    expect(result.colorVarMap.get('--brand')).toBe('#e11d48');
  });

  it('normalises shorthand hex to 6-digit', () => {
    const style = document.createElement('style');
    style.textContent = ':root { --accent: #f0f; }';
    document.head.appendChild(style);
    const result = scanStylesheets(document);
    expect(result.colorVarMap.get('--accent')).toBe('#ff00ff');
  });

  it('handles rgb() values in variables', () => {
    const style = document.createElement('style');
    style.textContent = ':root { --text: rgb(15, 23, 42); }';
    document.head.appendChild(style);
    const result = scanStylesheets(document);
    expect(result.colorVarMap.get('--text')).toBe('#0f172a');
  });

  it('sets resolvedHex for color tokens', () => {
    const style = document.createElement('style');
    style.textContent = ':root { --color-primary: #3b82f6; --font-body: Inter, sans-serif; }';
    document.head.appendChild(style);
    const result = scanStylesheets(document);
    const colorToken = result.tokens.find(t => t.name === '--color-primary');
    expect(colorToken?.resolvedHex).toBe('#3b82f6');
    const fontToken = result.tokens.find(t => t.name === '--font-body');
    expect(fontToken?.resolvedHex).toBeUndefined();
  });

  it('builds hexToVarName inverse map (first wins)', () => {
    const style = document.createElement('style');
    style.textContent = ':root { --primary: #3b82f6; --brand-blue: #3b82f6; }';
    document.head.appendChild(style);
    const result = scanStylesheets(document);
    expect(result.hexToVarName.get('#3b82f6')).toBe('--primary');
  });

  it('skips rgba with alpha < 1', () => {
    const style = document.createElement('style');
    style.textContent = ':root { --overlay: rgba(0, 0, 0, 0.5); }';
    document.head.appendChild(style);
    const result = scanStylesheets(document);
    expect(result.colorVarMap.has('--overlay')).toBe(false);
    const token = result.tokens.find(t => t.name === '--overlay');
    expect(token?.resolvedHex).toBeUndefined();
  });

  it('reads inline style on html element', () => {
    document.documentElement.setAttribute('style', '--inline-var: #ff0000;');
    const result = scanStylesheets(document);
    expect(result.colorVarMap.get('--inline-var')).toBe('#ff0000');
    document.documentElement.removeAttribute('style');
  });
});
