import type { ExtractedAnimation } from './types.js';

/**
 * Time value token regex: matches values like 0.3s, 300ms, 0s, etc.
 * Used to identify duration and delay tokens within a shorthand segment.
 */
const TIME_VALUE_RE = /^[\d.]+m?s$/;

/**
 * Known CSS timing-function keywords and function prefixes.
 * Used to identify the timing-function token within a shorthand segment.
 */
const TIMING_KEYWORDS = new Set(['ease', 'ease-in', 'ease-out', 'ease-in-out', 'linear', 'step-start', 'step-end']);

const isTimingFunction = (token: string): boolean =>
  TIMING_KEYWORDS.has(token) ||
  token.startsWith('cubic-bezier(') ||
  token.startsWith('steps(') ||
  token.startsWith('linear(');

/**
 * Parse a single transition shorthand segment into its components.
 *
 * The CSS transition shorthand format is:
 *   <property> <duration> [<timing-function>] [<delay>]
 *
 * Returns null when the segment represents a no-op (property is "none",
 * or no time values are present).
 */
const parseTransitionSegment = (
  segment: string,
): Pick<ExtractedAnimation, 'property' | 'duration' | 'timingFunction' | 'delay'> | null => {
  const tokens = segment.trim().split(/\s+/);
  if (!tokens.length) return null;

  // The first token is always the transition-property (e.g. "opacity", "all")
  const property = tokens[0];
  if (property === 'none') return null;

  let duration = '0s';
  let delay = '0s';
  let timingFunction = 'ease';

  // CSS spec: first <time> is duration, second <time> is delay
  let timeCount = 0;
  for (let i = 1; i < tokens.length; i++) {
    const token = tokens[i];
    if (TIME_VALUE_RE.test(token)) {
      if (timeCount === 0) {
        duration = token;
      } else {
        delay = token;
      }
      timeCount++;
    } else if (isTimingFunction(token)) {
      timingFunction = token;
    }
  }

  // Ignore entries that have no real duration (0s default means no explicit transition)
  if (duration === '0s' && timeCount === 0) return null;

  return { property, duration, timingFunction, delay };
};

/**
 * Parse a single animation shorthand segment into its components.
 *
 * The CSS animation shorthand format is:
 *   <name> <duration> [<timing-function>] [<delay>] [<iteration-count>]
 *   [<direction>] [<fill-mode>] [<play-state>]
 *
 * We only extract name, duration, timing-function, and delay.
 * Returns null when the animation name is "none".
 */
const parseAnimationSegment = (
  segment: string,
): Pick<ExtractedAnimation, 'property' | 'duration' | 'timingFunction' | 'delay'> | null => {
  const tokens = segment.trim().split(/\s+/);
  if (!tokens.length) return null;

  // Identify the name token — the one that is not a recognised time value,
  // timing function, iteration count (number or "infinite"), direction keyword,
  // fill-mode keyword, or play-state keyword.
  const NON_NAME_KEYWORDS = new Set([
    'infinite',
    'normal',
    'reverse',
    'alternate',
    'alternate-reverse',
    'none',
    'forwards',
    'backwards',
    'both',
    'running',
    'paused',
  ]);

  let property: string | null = null;
  let duration = '0s';
  let delay = '0s';
  let timingFunction = 'ease';
  let timeCount = 0;

  for (const token of tokens) {
    if (TIME_VALUE_RE.test(token)) {
      if (timeCount === 0) {
        duration = token;
      } else {
        delay = token;
      }
      timeCount++;
    } else if (isTimingFunction(token)) {
      timingFunction = token;
    } else if (!NON_NAME_KEYWORDS.has(token) && !/^\d+(\.\d+)?$/.test(token)) {
      // First candidate that isn't a reserved value is the animation name
      if (property === null) {
        property = token;
      }
    }
  }

  if (!property || property === 'none') return null;
  if (duration === '0s' && timeCount === 0) return null;

  return { property, duration, timingFunction, delay };
};

/**
 * Split a CSS shorthand value that may contain multiple comma-separated
 * entries (e.g. "opacity 0.3s ease, transform 0.5s linear") into individual
 * segments while respecting parentheses (cubic-bezier, steps, etc.).
 */
const splitShorthandSegments = (value: string): string[] => {
  const segments: string[] = [];
  let depth = 0;
  let start = 0;

  for (let i = 0; i < value.length; i++) {
    if (value[i] === '(') {
      depth++;
    } else if (value[i] === ')') {
      depth--;
    } else if (value[i] === ',' && depth === 0) {
      segments.push(value.slice(start, i));
      start = i + 1;
    }
  }
  segments.push(value.slice(start));

  return segments.map(s => s.trim()).filter(Boolean);
};

/**
 * Extract transition and animation CSS properties from all descendant elements
 * of `root`.
 *
 * Only inline style declarations are inspected. Each unique combination of
 * (property + duration + timingFunction + delay) is deduplicated and its
 * usageCount reflects how many elements declare it. Results are sorted by
 * usageCount descending.
 *
 * In jsdom, getComputedStyle does not fully parse transition/animation
 * shorthands, so we read the raw inline style attribute string directly.
 */
const extractAnimations = (root: Element): ExtractedAnimation[] => {
  // key → ExtractedAnimation accumulator
  const animationMap = new Map<string, ExtractedAnimation>();

  const record = (parsed: Pick<ExtractedAnimation, 'property' | 'duration' | 'timingFunction' | 'delay'>) => {
    const key = `${parsed.property}||${parsed.duration}||${parsed.timingFunction}||${parsed.delay}`;
    const existing = animationMap.get(key);
    if (existing) {
      existing.usageCount++;
    } else {
      animationMap.set(key, { ...parsed, usageCount: 1 });
    }
  };

  const elements = root.querySelectorAll('*');

  elements.forEach(el => {
    const style = (el as HTMLElement).style;
    if (!style.length) return;

    // --- transitions ---
    const transitionValue = style.getPropertyValue('transition');
    if (transitionValue) {
      for (const segment of splitShorthandSegments(transitionValue)) {
        const parsed = parseTransitionSegment(segment);
        if (parsed) record(parsed);
      }
    }

    // --- animations ---
    const animationValue = style.getPropertyValue('animation');
    if (animationValue) {
      for (const segment of splitShorthandSegments(animationValue)) {
        const parsed = parseAnimationSegment(segment);
        if (parsed) record(parsed);
      }
    }
  });

  return Array.from(animationMap.values()).sort((a, b) => b.usageCount - a.usageCount);
};

export { extractAnimations };
