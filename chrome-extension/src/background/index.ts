import 'webextension-polyfill';

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);
