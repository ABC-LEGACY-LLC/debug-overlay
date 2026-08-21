// dbgov service worker — the extension's network door.
// A page's CSP cannot reach in here, so update checks work everywhere.
chrome.runtime.onMessage.addListener((msg, sender, respond) => {
  if (msg && msg.type === 'dbgov-fetch' && typeof msg.url === 'string' &&
      msg.url.startsWith("https://raw.githubusercontent.com/ABC-LEGACY-LLC/debug-overlay/main/dist/")) {
    fetch(msg.url, { cache: 'no-store' })
      .then((r) => r.text()).then((text) => respond({ ok: true, text }))
      .catch((e) => respond({ ok: false, error: String(e) }));
    return true;   // async response
  }
});
