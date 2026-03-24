/* eslint-disable */
(function () {
  var nonce = (document.currentScript && document.currentScript.getAttribute('data-vir-nonce')) || '';
  if (window.__virConsolePatched) return;
  window.__virConsolePatched = true;

  var MAX_ENTRIES = 50;
  var MAX_MSG_LENGTH = 500;
  var entries = [];
  var requestEvent = 'vir-request-console-errors' + (nonce ? '-' + nonce : '');
  var responseEvent = 'vir-console-errors' + (nonce ? '-' + nonce : '');

  var origError = console.error;
  var origWarn = console.warn;

  console.error = function () {
    var msg = Array.prototype.slice
      .call(arguments)
      .map(function (a) {
        try {
          return typeof a === 'string' ? a : JSON.stringify(a);
        } catch (e) {
          return String(a);
        }
      })
      .join(' ')
      .slice(0, MAX_MSG_LENGTH);
    entries.push({ level: 'error', message: msg, timestamp: Date.now() });
    if (entries.length > MAX_ENTRIES) entries.shift();
    return origError.apply(console, arguments);
  };

  console.warn = function () {
    var msg = Array.prototype.slice
      .call(arguments)
      .map(function (a) {
        try {
          return typeof a === 'string' ? a : JSON.stringify(a);
        } catch (e) {
          return String(a);
        }
      })
      .join(' ')
      .slice(0, MAX_MSG_LENGTH);
    entries.push({ level: 'warn', message: msg, timestamp: Date.now() });
    if (entries.length > MAX_ENTRIES) entries.shift();
    return origWarn.apply(console, arguments);
  };

  document.addEventListener(requestEvent, function () {
    document.dispatchEvent(
      new CustomEvent(responseEvent, {
        detail: JSON.stringify(entries),
      }),
    );
  });
})();
