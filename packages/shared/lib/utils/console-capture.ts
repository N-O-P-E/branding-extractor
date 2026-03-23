/**
 * Console capture for main-world injection.
 *
 * Chrome content scripts run in an isolated JS context — they share the DOM
 * but have a separate window/console. To capture host page console.error/warn,
 * we inject an inline <script> into the page's main world.
 *
 * Communication back to content scripts uses custom DOM events.
 */

/** The inline script source to inject into the page's main world */
export const CONSOLE_CAPTURE_SCRIPT = `
(function() {
  if (window.__virConsolePatched) return;
  window.__virConsolePatched = true;

  var MAX_ENTRIES = 50;
  var MAX_MSG_LENGTH = 500;
  var entries = [];

  var origError = console.error;
  var origWarn = console.warn;

  console.error = function() {
    var msg = Array.prototype.slice.call(arguments).map(function(a) {
      try { return typeof a === 'string' ? a : JSON.stringify(a); }
      catch(e) { return String(a); }
    }).join(' ').slice(0, MAX_MSG_LENGTH);
    entries.push({ level: 'error', message: msg, timestamp: Date.now() });
    if (entries.length > MAX_ENTRIES) entries.shift();
    return origError.apply(console, arguments);
  };

  console.warn = function() {
    var msg = Array.prototype.slice.call(arguments).map(function(a) {
      try { return typeof a === 'string' ? a : JSON.stringify(a); }
      catch(e) { return String(a); }
    }).join(' ').slice(0, MAX_MSG_LENGTH);
    entries.push({ level: 'warn', message: msg, timestamp: Date.now() });
    if (entries.length > MAX_ENTRIES) entries.shift();
    return origWarn.apply(console, arguments);
  };

  document.addEventListener('vir-request-console-errors', function() {
    document.dispatchEvent(new CustomEvent('vir-console-errors', {
      detail: JSON.stringify(entries)
    }));
  });
})();
`;

/** Retrieve captured console errors from the main-world script via DOM events */
export const getConsoleErrors = (): Promise<Array<{ level: 'error' | 'warn'; message: string; timestamp: number }>> =>
  new Promise(resolve => {
    const nonce = (window as unknown as { __virNonce?: string }).__virNonce ?? '';
    const suffix = nonce ? `-${nonce}` : '';
    const requestEventName = `vir-request-console-errors${suffix}`;
    const responseEventName = `vir-console-errors${suffix}`;

    const timeout = setTimeout(() => {
      resolve([]);
    }, 500);

    const handler = (event: Event) => {
      clearTimeout(timeout);
      document.removeEventListener(responseEventName, handler);
      try {
        const data = JSON.parse((event as CustomEvent).detail);
        resolve(Array.isArray(data) ? data : []);
      } catch {
        resolve([]);
      }
    };

    document.addEventListener(responseEventName, handler);
    document.dispatchEvent(new CustomEvent(requestEventName));
  });
