import { extractAnimations } from '../animations.js';
import { describe, it, expect, afterEach } from 'vitest';

describe('extractAnimations', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('extracts transition properties', () => {
    document.body.innerHTML = '<div style="transition: opacity 0.3s ease;">Test</div>';
    const animations = extractAnimations(document.body);
    expect(animations).toContainEqual(
      expect.objectContaining({
        property: 'opacity',
        duration: '0.3s',
        timingFunction: 'ease',
      }),
    );
  });

  it('extracts animation properties', () => {
    document.body.innerHTML = '<div style="animation: fadeIn 1s ease-in-out;">Test</div>';
    const animations = extractAnimations(document.body);
    expect(animations).toContainEqual(
      expect.objectContaining({
        property: 'fadeIn',
        duration: '1s',
        timingFunction: 'ease-in-out',
      }),
    );
  });

  it('counts usage', () => {
    document.body.innerHTML = `
      <div style="transition: opacity 0.3s ease;">A</div>
      <div style="transition: opacity 0.3s ease;">B</div>
    `;
    const animations = extractAnimations(document.body);
    const opacity = animations.find(a => a.property === 'opacity');
    expect(opacity?.usageCount).toBe(2);
  });

  it('filters out none transitions', () => {
    document.body.innerHTML = '<div style="transition: none;">Test</div>';
    const animations = extractAnimations(document.body);
    expect(animations).toHaveLength(0);
  });

  it('extracts transition delay', () => {
    document.body.innerHTML = '<div style="transition: opacity 0.3s ease 0.1s;">Test</div>';
    const animations = extractAnimations(document.body);
    expect(animations[0]?.delay).toBe('0.1s');
  });

  it('handles multiple transition properties', () => {
    document.body.innerHTML = '<div style="transition: opacity 0.3s ease, transform 0.5s linear;">Test</div>';
    const animations = extractAnimations(document.body);
    expect(animations.length).toBeGreaterThanOrEqual(2);
  });

  it('sorts by usage descending', () => {
    document.body.innerHTML = `
      <div style="transition: opacity 0.3s ease;">A</div>
      <div style="transition: transform 0.5s linear;">B</div>
      <div style="transition: transform 0.5s linear;">C</div>
    `;
    const animations = extractAnimations(document.body);
    expect(animations[0].property).toBe('transform');
  });

  it('defaults delay to 0s when not specified', () => {
    document.body.innerHTML = '<div style="transition: color 0.2s ease;">Test</div>';
    const animations = extractAnimations(document.body);
    expect(animations[0]?.delay).toBe('0s');
  });

  it('extracts animation delay', () => {
    document.body.innerHTML = '<div style="animation: slideIn 0.5s ease 0.2s;">Test</div>';
    const animations = extractAnimations(document.body);
    expect(animations[0]?.delay).toBe('0.2s');
  });

  it('filters out animation with name none', () => {
    document.body.innerHTML = '<div style="animation: none;">Test</div>';
    const animations = extractAnimations(document.body);
    expect(animations).toHaveLength(0);
  });

  it('deduplicates identical transition combinations across elements', () => {
    document.body.innerHTML = `
      <div style="transition: opacity 0.3s ease 0s;">A</div>
      <div style="transition: opacity 0.3s ease 0s;">B</div>
      <div style="transition: opacity 0.3s ease 0s;">C</div>
    `;
    const animations = extractAnimations(document.body);
    const opacity = animations.filter(a => a.property === 'opacity');
    expect(opacity).toHaveLength(1);
    expect(opacity[0].usageCount).toBe(3);
  });

  it('treats different durations as distinct entries', () => {
    document.body.innerHTML = `
      <div style="transition: opacity 0.3s ease;">A</div>
      <div style="transition: opacity 0.5s ease;">B</div>
    `;
    const animations = extractAnimations(document.body);
    const opacityEntries = animations.filter(a => a.property === 'opacity');
    expect(opacityEntries).toHaveLength(2);
  });
});
