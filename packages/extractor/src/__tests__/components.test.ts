import { detectComponents } from '../components.js';
import { describe, it, expect, afterEach } from 'vitest';

describe('detectComponents', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('detects button elements', () => {
    document.body.innerHTML =
      '<button style="padding: 8px 16px; background-color: blue; border-radius: 4px;">Click</button>';
    const components = detectComponents(document.body);
    expect(components).toContainEqual(expect.objectContaining({ type: 'button' }));
  });

  it('detects input elements', () => {
    document.body.innerHTML = '<input type="text" style="padding: 8px; border: 1px solid gray;" />';
    const components = detectComponents(document.body);
    expect(components).toContainEqual(expect.objectContaining({ type: 'input' }));
  });

  it('detects card-like elements', () => {
    document.body.innerHTML =
      '<div style="padding: 16px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">Card</div>';
    const components = detectComponents(document.body);
    expect(components).toContainEqual(expect.objectContaining({ type: 'card' }));
  });

  it('counts similar components', () => {
    document.body.innerHTML = `
      <button style="padding: 8px; background-color: blue;">A</button>
      <button style="padding: 8px; background-color: blue;">B</button>
    `;
    const components = detectComponents(document.body);
    const buttons = components.filter(c => c.type === 'button');
    expect(buttons.length).toBeGreaterThanOrEqual(1);
    expect(buttons[0]?.count).toBe(2);
  });

  it('detects role=button links', () => {
    document.body.innerHTML =
      '<a role="button" style="padding: 8px; background-color: blue; border-radius: 4px;" href="#">Click</a>';
    const components = detectComponents(document.body);
    expect(components).toContainEqual(expect.objectContaining({ type: 'button' }));
  });

  it('generates a selector', () => {
    document.body.innerHTML = '<button class="btn-primary" style="padding: 8px;">Click</button>';
    const components = detectComponents(document.body);
    const btn = components.find(c => c.type === 'button');
    expect(btn?.selector).toBeTruthy();
  });

  it('extracts component styles', () => {
    document.body.innerHTML =
      '<button style="padding: 8px; background-color: rgb(0, 128, 255); border-radius: 4px;">Click</button>';
    const components = detectComponents(document.body);
    const btn = components.find(c => c.type === 'button');
    expect(btn?.styles).toHaveProperty('padding');
    expect(btn?.styles).toHaveProperty('background-color');
    expect(btn?.styles).toHaveProperty('border-radius');
  });

  it('detects textarea as input', () => {
    document.body.innerHTML = '<textarea style="padding: 8px;">Text</textarea>';
    const components = detectComponents(document.body);
    expect(components).toContainEqual(expect.objectContaining({ type: 'input' }));
  });

  it('detects select as input', () => {
    document.body.innerHTML = '<select style="padding: 4px;"><option value="a">A</option></select>';
    const components = detectComponents(document.body);
    expect(components).toContainEqual(expect.objectContaining({ type: 'input' }));
  });

  it('detects contenteditable element as input', () => {
    document.body.innerHTML = '<div contenteditable="true" style="padding: 8px; border: 1px solid gray;">Edit me</div>';
    const components = detectComponents(document.body);
    expect(components).toContainEqual(expect.objectContaining({ type: 'input' }));
  });

  it('detects input[type=submit] as button', () => {
    document.body.innerHTML = '<input type="submit" value="Submit" style="padding: 8px; background-color: green;" />';
    const components = detectComponents(document.body);
    expect(components).toContainEqual(expect.objectContaining({ type: 'button' }));
  });

  it('detects anchor with button-like styles as button', () => {
    document.body.innerHTML =
      '<a href="#" style="padding: 8px 16px; background-color: blue; border-radius: 4px;">Link Button</a>';
    const components = detectComponents(document.body);
    expect(components).toContainEqual(expect.objectContaining({ type: 'button' }));
  });

  it('does not detect a plain div without card-like styles as a card', () => {
    document.body.innerHTML = '<div style="color: red;">Plain</div>';
    const components = detectComponents(document.body);
    expect(components.find(c => c.type === 'card')).toBeUndefined();
  });

  it('does not detect a card when only one card trait is present', () => {
    document.body.innerHTML = '<div style="border-radius: 8px;">Only radius</div>';
    const components = detectComponents(document.body);
    expect(components.find(c => c.type === 'card')).toBeUndefined();
  });

  it('groups components with the same type and key styles together', () => {
    document.body.innerHTML = `
      <input type="text" style="padding: 8px; border: 1px solid gray;" />
      <input type="email" style="padding: 8px; border: 1px solid gray;" />
    `;
    const components = detectComponents(document.body);
    const inputs = components.filter(c => c.type === 'input');
    // Both inputs share the same key styles so they should be grouped
    expect(inputs.length).toBeGreaterThanOrEqual(1);
    const grouped = inputs.find(i => i.count === 2);
    expect(grouped).toBeDefined();
  });

  it('returns an empty array for an empty root', () => {
    document.body.innerHTML = '';
    const components = detectComponents(document.body);
    expect(components).toEqual([]);
  });
});
