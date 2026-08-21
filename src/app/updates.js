import { CONFIG } from '../core/config.js';
import { Store } from '../core/state.js';
import { Menu } from '../ui/menu.js';
import { Panel } from '../ui/panel.js';

/* ======================================================================
  UPDATES — staleness announces itself

     "A stale install and a current one otherwise look identical" is the
     failure __VERSION__ exists for; this closes the loop from the install
     side the way `npm run shipped` closes it from the dev side. A daily
     automatic check is the floor; right-clicking ⏻ is the user asking —
     and a manual check always answers, either way, because a button that
     does nothing visible is worse than no button.

     ONE endpoint, THREE doors, picked at runtime — the Store pattern:
       extension   → the service worker fetches (a page's CSP cannot
                     reach into it); pinned to the repo host by manifest
       userscript  → the manager's GM_xmlhttpRequest (ignores page CSP;
                     @connect whitelists the repo host, so no prompts)
       elsewhere   → plain fetch — the dev page, permissive sites
     Every door fails SILENT on error: offline is not news, and a false
     nag would teach the eye to ignore a true one.
   ====================================================================== */

/** Numeric, segment-wise — '3.10.2' beats '3.9.9'. Shared with the
 *  self-updater, which must refuse anything that does not increase. */
export function newer(a, b) {
        const A = String(a).split('.').map(Number);
        const B = String(b).split('.').map(Number);
        for (let i = 0; i < Math.max(A.length, B.length); i++) {
          const d = (A[i] || 0) - (B[i] || 0);
          if (d) return d > 0;
        }
        return false;
}

function fetchText(url) {
        // extension content script: the worker's door
        if (typeof chrome !== 'undefined' && chrome.runtime?.id) {
          return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({ type: 'debug-overlay-fetch', url }, (r) => {
              if (chrome.runtime.lastError || !r?.ok) reject(new Error(r?.error || 'no worker'));
              else resolve(r.text);
            });
          });
        }
        // userscript: the manager's door
        if (typeof GM_xmlhttpRequest !== 'undefined') {
          return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
              method: 'GET', url, nocache: true,
              onload: (r) => (r.status >= 200 && r.status < 300
                ? resolve(r.responseText) : reject(new Error('http ' + r.status))),
              onerror: () => reject(new Error('network')),
              ontimeout: () => reject(new Error('timeout')),
            });
          });
        }
        // dev page and friends
        return fetch(url, { cache: 'no-store' }).then((r) => {
          if (!r.ok) throw new Error('http ' + r.status);
          return r.text();
        });
}

export const Updates = {
        latest: null,          // a KNOWN newer version, or null
        applied: false,        // the user pressed Update THIS page-session

        async check(force) {
          let saved = {};
          try { saved = JSON.parse(Store.get('__dbgov_upd') || '{}') || {}; } catch {}
          if (!force && Date.now() - (saved.t || 0) < CONFIG.UPDATE.EVERY) {
            // inside the throttle window the last answer stands
            if (saved.v && newer(saved.v, CONFIG.VERSION)) Updates.found(saved.v);
            return Updates.latest;
          }
          try {
            const meta = await fetchText(CONFIG.META_URL);
            const v = (/@version\s+([\d.]+)/.exec(meta) || [])[1];
            Store.set('__dbgov_upd', JSON.stringify({ t: Date.now(), v: v || null }));
            if (v && newer(v, CONFIG.VERSION)) Updates.found(v);
            else Updates.latest = null;
          } catch {
            /* silent: offline is not news */
          }
          return Updates.latest;
        },

        found(v) {
          Updates.latest = v;
          Panel.setUpdate(v);
        },

        /** What pressing Update DOES, per gate. The userscript's manager owns
         *  installation, so its click opens the install URL and Tampermonkey's
         *  own dialog finishes the job in one more click. The extension's
         *  self-updater arrives with its options page; until then, honesty. */
        apply(x, y) {
          /* THE PAGE CANNOT KNOW the install finished: the manager swaps the
             script on disk, but this page keeps RUNNING the old one until it
             reloads, and the running code only knows its own baked version —
             a user updated, saw nothing change, and rightly asked why. So
             pressing Update immediately reopens the menu with the next step
             spelled out and a Refresh button that does it. */
          Updates.applied = true;
          if (typeof chrome !== 'undefined' && chrome.runtime?.id) {
            // the self-updater lives on the options page — the FS permission
            // re-grant needs a user gesture in an extension context, and a
            // content script is neither. The worker opens it.
            try { chrome.runtime.sendMessage({ type: 'debug-overlay-open-options' }); } catch {}
          } else {
            window.open(CONFIG.INSTALL_URL, '_blank');
          }
          // the cursor menu only makes sense where a cursor asked — the
          // cockpit calls this with no coordinates and shows its own next step
          if (x != null) Updates.menu(x, y, true);
        },

        /** The ⏻ menu — the same cursor menu right-click already speaks.
         *  A manual check REOPENS the menu with its answer where the question
         *  was asked: "✓ current" was being flashed into the round ⏻ button,
         *  where a sentence cannot fit, and painted as smear. */
        menu(x, y, answered) {
          const rows = [];
          if (Updates.applied && Updates.latest) {
            // the update is installed (or installing) — this PAGE still runs
            // the old code, and only a reload changes that
            rows.push({ label: `↻ Refresh page — activate v${Updates.latest}`,
                        run: () => location.reload() });
            rows.push({ label: 'Open the install page again',
                        run: () => Updates.apply(x, y) });
          } else if (Updates.latest) {
            rows.push({ label: `Update to v${Updates.latest}`, run: () => Updates.apply(x, y) });
          } else if (answered) {
            rows.push({ label: `✓ current — v${CONFIG.VERSION}`, run: () => {} });
          }
          rows.push({
            label: answered ? 'Check again' : 'Check for updates now',
            run: async () => {
              await Updates.check(true);
              Updates.menu(x, y, true);
            },
          });
          Menu.open(x, y, rows);
        },

        schedule() {
          setTimeout(() => Updates.check(false), CONFIG.UPDATE.BOOT_DELAY);
        },
};
