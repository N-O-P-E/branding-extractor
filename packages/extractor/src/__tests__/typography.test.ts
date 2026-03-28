import { extractTypography } from '../typography.js';
import { afterEach, describe, expect, it } from 'vitest';

describe('extractTypography', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('extracts font family and size', () => {
    document.body.innerHTML = '<p style="font-family: Inter; font-size: 16px;">Test</p>';
    const typography = extractTypography(document.body);
    expect(typography).toContainEqual(
      expect.objectContaining({
        fontFamily: expect.stringContaining('Inter'),
        fontSize: '16px',
      }),
    );
  });

  it('groups by unique typography combination', () => {
    document.body.innerHTML = `
      <p style="font-family: Inter; font-size: 16px;">A</p>
      <p style="font-family: Inter; font-size: 16px;">B</p>
      <p style="font-family: Inter; font-size: 24px;">C</p>
    `;
    const typography = extractTypography(document.body);
    const body16 = typography.find(t => t.fontSize === '16px');
    expect(body16?.usageCount).toBe(2);
  });

  it('tracks element tag name', () => {
    document.body.innerHTML = '<h1 style="font-family: Inter; font-size: 32px;">Title</h1>';
    const typography = extractTypography(document.body);
    expect(typography[0]?.element).toBe('h1');
  });

  it('sorts by usage count descending', () => {
    document.body.innerHTML = `
      <p style="font-family: Inter; font-size: 14px;">A</p>
      <p style="font-family: Inter; font-size: 16px;">B</p>
      <p style="font-family: Inter; font-size: 16px;">C</p>
    `;
    const typography = extractTypography(document.body);
    expect(typography[0].fontSize).toBe('16px');
  });

  it('extracts font weight and line height', () => {
    document.body.innerHTML =
      '<p style="font-family: Inter; font-size: 16px; font-weight: 700; line-height: 1.5;">Bold</p>';
    const typography = extractTypography(document.body);
    expect(typography[0]).toMatchObject({
      fontWeight: '700',
      lineHeight: '1.5',
    });
  });

  it('extracts letter spacing', () => {
    document.body.innerHTML = '<p style="font-family: Inter; font-size: 16px; letter-spacing: 0.05em;">Spaced</p>';
    const typography = extractTypography(document.body);
    expect(typography[0]).toMatchObject({
      letterSpacing: '0.05em',
    });
  });

  it('deduplicates identical typography across different element types by most common tag', () => {
    document.body.innerHTML = `
      <p style="font-family: Inter; font-size: 16px;">One</p>
      <p style="font-family: Inter; font-size: 16px;">Two</p>
      <span style="font-family: Inter; font-size: 16px;">Three</span>
    `;
    const typography = extractTypography(document.body);
    const entry = typography.find(t => t.fontSize === '16px');
    expect(entry?.usageCount).toBe(3);
    expect(entry?.element).toBe('p');
  });

  it('skips elements with no inline typography styles', () => {
    document.body.innerHTML = '<div><p>No styles</p></div>';
    const typography = extractTypography(document.body);
    expect(typography).toHaveLength(0);
  });
});
