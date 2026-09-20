// Debug Overlay service worker — the extension's network door.
// A page's CSP cannot reach in here, so update checks work everywhere.
chrome.runtime.onMessage.addListener((msg, sender, respond) => {
  if (msg && msg.type === 'debug-overlay-fetch' && typeof msg.url === 'string' &&
      msg.url.startsWith("https://raw.githubusercontent.com/ABC-LEGACY-LLC/debug-overlay/main/dist/browser-extension/")) {
    fetch(msg.url, { cache: 'no-store' })
      .then((r) => r.text()).then((text) => respond({ ok: true, text }))
      .catch((e) => respond({ ok: false, error: String(e) }));
    return true;   // async response
  }
  if (msg && msg.type === 'debug-overlay-open-options') {
    chrome.runtime.openOptionsPage();
  }
});
chrome.runtime.onMessage.addListener((msg, sender, respond) => {
  if (!msg || msg.type !== 'debug-overlay-capture') return;
  const tab = sender && sender.tab;
  const where = tab ? ` [tab ${tab.id}, window ${tab.windowId}, active ${tab.active}]` : ' [no sender tab]';
  try {
    const done = (url) => {
      const e = chrome.runtime.lastError;
      if (e || !url) respond({ ok: false, error: ((e && e.message) ||
        'the tab could not be captured') + where });
      else respond({ ok: true, url });
    };
    if (tab) chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' }, done);
    else chrome.tabs.captureVisibleTab({ format: 'png' }, done);
  } catch (e) { respond({ ok: false, error: String(e) + where }); }
  return true;   // async response
});
const canOpen = !!(chrome.sidePanel && chrome.sidePanel.open);
chrome.sidePanel?.setPanelBehavior({ openPanelOnActionClick: !canOpen }).catch(() => {});
if (canOpen) chrome.action.onClicked.addListener((tab) => {
  // the click itself is what grants activeTab for this tab; opening the
  // panel here is what keeps that grant instead of spending it on Chrome
  chrome.sidePanel.open({ tabId: tab.id }).catch(() => {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  });
});
