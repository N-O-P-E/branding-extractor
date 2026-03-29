import 'webextension-polyfill';

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'CAPTURE_VISIBLE_TAB') {
    chrome.tabs.captureVisibleTab(undefined, { format: 'png' }, dataUrl => {
      sendResponse({ dataUrl });
    });
    return true; // async response
  }
});
