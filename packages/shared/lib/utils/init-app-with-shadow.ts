import { createRoot } from 'react-dom/client';
import type { ReactElement } from 'react';

export const initAppWithShadow = ({ id, app, inlineCss }: { id: string; inlineCss: string; app: ReactElement }) => {
  const root = document.createElement('div');
  root.id = id;
  root.style.position = 'fixed';
  root.style.top = '0';
  root.style.left = '0';
  root.style.width = '0';
  root.style.height = '0';
  root.style.overflow = 'visible';
  root.style.zIndex = '2147483647';

  document.body.append(root);

  const rootIntoShadow = document.createElement('div');
  rootIntoShadow.id = `shadow-root-${id}`;

  const shadowRoot = root.attachShadow({ mode: 'open', delegatesFocus: true });

  // Prevent keyboard events from reaching the host page.
  // We intercept at the window capture phase (earliest point) to block both
  // capture-phase and bubble-phase listeners on the host page. Then we
  // re-dispatch a non-composed clone so the event still propagates within
  // the shadow DOM and React's delegation picks it up normally.
  for (const eventType of ['keydown', 'keyup', 'keypress'] as const) {
    window.addEventListener(
      eventType,
      e => {
        if (!e.composedPath().includes(shadowRoot)) return;

        const ke = e as KeyboardEvent;
        e.stopImmediatePropagation();

        // Clone with composed:false so it stays inside the shadow DOM
        const clone = new KeyboardEvent(ke.type, {
          key: ke.key,
          code: ke.code,
          location: ke.location,
          ctrlKey: ke.ctrlKey,
          shiftKey: ke.shiftKey,
          altKey: ke.altKey,
          metaKey: ke.metaKey,
          repeat: ke.repeat,
          isComposing: ke.isComposing,
          bubbles: true,
          cancelable: true,
          composed: false,
        });

        (e.composedPath()[0] as Element).dispatchEvent(clone);

        // If our handlers called preventDefault, propagate to the original
        if (clone.defaultPrevented) {
          e.preventDefault();
        }
      },
      true,
    );
  }

  if (navigator.userAgent.includes('Firefox')) {
    /**
     * In the firefox environment, adoptedStyleSheets cannot be used due to the bug
     * @url https://bugzilla.mozilla.org/show_bug.cgi?id=1770592
     *
     * Injecting styles into the document, this may cause style conflicts with the host page
     */
    const styleElement = document.createElement('style');
    styleElement.innerHTML = inlineCss;
    shadowRoot.appendChild(styleElement);
  } else {
    /** Inject styles into shadow dom */
    const globalStyleSheet = new CSSStyleSheet();
    globalStyleSheet.replaceSync(inlineCss);
    shadowRoot.adoptedStyleSheets = [globalStyleSheet];
  }

  shadowRoot.appendChild(rootIntoShadow);
  createRoot(rootIntoShadow).render(app);
};
