// Debug Overlay service worker — opens the side panel from the toolbar button.
// The store build has no network door: Chrome handles updates, so nothing
// here fetches, downloads or writes anything.
chrome.sidePanel?.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
