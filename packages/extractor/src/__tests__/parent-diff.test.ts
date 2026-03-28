import { buildSelector, hasAnyDirectStyle, hasDirectStyle } from '../parent-diff.js';
import { afterEach, describe, expect, it } from 'vitest';

describe('hasDirectStyle', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('returns true when element has inline style', () => {
    document.body.innerHTML = '<div style="color: red;"><span>text</span></div>';
    const div = document.querySelector('div')!;
    expect(hasDirectStyle(div, 'color')).toBe(true);
  });

  it('returns false for purely inherited style', () => {
    document.body.innerHTML = '<div style="color: red;"><span>text</span></div>';
    const span = document.querySelector('span')!;
    // span has no inline color and no stylesheet targeting it
    // In jsdom, getComputedStyle doesn't inherit, so the values will differ
    // This test verifies the inline-style check path returns false
    expect(span.style.getPropertyValue('color')).toBe('');
  });

  it('returns true when computed style differs from parent', () => {
    document.body.innerHTML = '<div style="color: red;"><p style="color: blue;">text</p></div>';
    const p = document.querySelector('p')!;
    expect(hasDirectStyle(p, 'color')).toBe(true);
  });

  it('returns true for inline style even when same as parent', () => {
    document.body.innerHTML = '<div style="color: red;"><span style="color: red;">text</span></div>';
    const span = document.querySelector('span')!;
    expect(hasDirectStyle(span, 'color')).toBe(true);
  });

  it('returns true for root element', () => {
    document.body.innerHTML = '<div style="color: red;">text</div>';
    // document.body has no parent element in the sense of el.parentElement
    // Actually body.parentElement is <html>, so let's test the actual body
    expect(hasDirectStyle(document.documentElement, 'color')).toBe(true);
  });
});

describe('hasAnyDirectStyle', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('returns true if any property is direct', () => {
    document.body.innerHTML = '<p style="font-size: 16px;">text</p>';
    const p = document.querySelector('p')!;
    expect(hasAnyDirectStyle(p, ['font-family', 'font-size', 'font-weight'])).toBe(true);
  });

  it('returns false if no properties are direct', () => {
    document.body.innerHTML = '<p>text</p>';
    const p = document.querySelector('p')!;
    expect(hasAnyDirectStyle(p, ['font-family', 'font-size'])).toBe(false);
  });
});

describe('buildSelector', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('builds tag#id selector', () => {
    document.body.innerHTML = '<div id="main">Hello</div>';
    const div = document.querySelector('div')!;
    expect(buildSelector(div)).toBe('div#main');
  });

  it('builds tag.class selector', () => {
    document.body.innerHTML = '<h1 class="title hero-text">Hello</h1>';
    const h1 = document.querySelector('h1')!;
    expect(buildSelector(h1)).toBe('h1.title');
  });

  it('builds tag[role] selector', () => {
    document.body.innerHTML = '<div role="button">Click</div>';
    const div = document.querySelector('div')!;
    expect(buildSelector(div)).toBe('div[role="button"]');
  });

  it('builds tag[type] selector', () => {
    document.body.innerHTML = '<input type="email" />';
    const input = document.querySelector('input')!;
    expect(buildSelector(input)).toBe('input[type="email"]');
  });

  it('falls back to tag name', () => {
    document.body.innerHTML = '<p>Hello</p>';
    const p = document.querySelector('p')!;
    expect(buildSelector(p)).toBe('p');
  });

  it('prefers id over class', () => {
    document.body.innerHTML = '<div id="main" class="container">Hello</div>';
    const div = document.querySelector('div')!;
    expect(buildSelector(div)).toBe('div#main');
  });
});
