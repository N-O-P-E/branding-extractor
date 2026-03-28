import { extractSpacing } from '../spacing.js';
import { describe, it, expect, afterEach } from 'vitest';

describe('extractSpacing', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('extracts padding values', () => {
    document.body.innerHTML = '<div style="padding: 16px;">Test</div>';
    const spacing = extractSpacing(document.body);
    expect(spacing).toContainEqual(expect.objectContaining({ value: '16px' }));
  });

  it('extracts margin values', () => {
    document.body.innerHTML = '<div style="margin: 24px;">Test</div>';
    const spacing = extractSpacing(document.body);
    expect(spacing).toContainEqual(expect.objectContaining({ value: '24px' }));
  });

  it('deduplicates and counts usage', () => {
    document.body.innerHTML = `
      <div style="padding: 16px;">A</div>
      <div style="margin: 16px;">B</div>
    `;
    const spacing = extractSpacing(document.body);
    const s16 = spacing.find(s => s.value === '16px');
    expect(s16?.usageCount).toBe(2);
    expect(s16?.properties).toContain('padding');
    expect(s16?.properties).toContain('margin');
  });

  it('filters out 0px values', () => {
    document.body.innerHTML = '<div style="margin: 0px;">Test</div>';
    const spacing = extractSpacing(document.body);
    expect(spacing.find(s => s.value === '0px')).toBeUndefined();
  });

  it('extracts gap values', () => {
    document.body.innerHTML = '<div style="display: flex; gap: 8px;">Test</div>';
    const spacing = extractSpacing(document.body);
    expect(spacing).toContainEqual(expect.objectContaining({ value: '8px' }));
  });

  it('sorts by usage descending', () => {
    document.body.innerHTML = `
      <div style="padding: 8px;">A</div>
      <div style="padding: 16px;">B</div>
      <div style="padding: 16px;">C</div>
    `;
    const spacing = extractSpacing(document.body);
    expect(spacing[0].value).toBe('16px');
  });

  it('extracts individual padding sides', () => {
    document.body.innerHTML = '<div style="padding-top: 12px; padding-bottom: 12px;">Test</div>';
    const spacing = extractSpacing(document.body);
    const s12 = spacing.find(s => s.value === '12px');
    expect(s12).toBeDefined();
    expect(s12?.properties).toContain('padding-top');
  });

  it('extracts individual margin sides', () => {
    document.body.innerHTML = '<div style="margin-left: 20px;">Test</div>';
    const spacing = extractSpacing(document.body);
    expect(spacing).toContainEqual(
      expect.objectContaining({ value: '20px', properties: expect.arrayContaining(['margin-left']) }),
    );
  });

  it('extracts row-gap and column-gap', () => {
    document.body.innerHTML = '<div style="display: grid; row-gap: 32px; column-gap: 16px;">Test</div>';
    const spacing = extractSpacing(document.body);
    expect(spacing).toContainEqual(
      expect.objectContaining({ value: '32px', properties: expect.arrayContaining(['row-gap']) }),
    );
    expect(spacing).toContainEqual(
      expect.objectContaining({ value: '16px', properties: expect.arrayContaining(['column-gap']) }),
    );
  });

  it('does not count inherited values from ancestors', () => {
    document.body.innerHTML = `
      <div style="padding: 16px;">
        <span>Inherited child — no inline style</span>
      </div>
    `;
    const spacing = extractSpacing(document.body);
    const s16 = spacing.find(s => s.value === '16px');
    // Only the outer div should be counted, not the span which has no inline style
    expect(s16?.usageCount).toBe(1);
  });

  it('tracks multiple properties for same value on same element', () => {
    document.body.innerHTML = '<div style="padding: 8px; margin: 8px;">Test</div>';
    const spacing = extractSpacing(document.body);
    const s8 = spacing.find(s => s.value === '8px');
    expect(s8?.properties).toContain('padding');
    expect(s8?.properties).toContain('margin');
  });
});
