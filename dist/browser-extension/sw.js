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
  try {
    chrome.tabs.captureVisibleTab({ format: 'png' }, (url) => {
      const e = chrome.runtime.lastError;
      if (e || !url) respond({ ok: false, error: (e && e.message) ||
        'the tab could not be captured — press the toolbar button to re-grant activeTab' });
      else respond({ ok: true, url });
    });
  } catch (e) { respond({ ok: false, error: String(e) }); }
  return true;   // async response
});
// the toolbar button opens the side panel (declared, so it needs no handler);
// guarded because browsers without a side panel still run everything else
chrome.sidePanel?.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
