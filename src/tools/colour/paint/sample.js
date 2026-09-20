import { Tools } from '../../../core/registry.js';
import { Probe } from './probe.js';

/**
 * THE PIXEL AS RENDERED — the one thing the walk cannot derive.
 *
 * Every layer above this is computed: a stack, a fold, a claim. The claim can
 * be wrong in ways the walk cannot see — a mask, a filter, a blend, a pseudo
 * no hit test reaches — and the ONLY way to find out is to look at what the
 * screen actually shows. The size of the disagreement is the finding: a
 * couple of units is a saturate, forty is a whole layer nobody accounted for.
 *
 * WHAT IT COSTS, and why it is gated the way it is. Reading a rendered pixel
 * means capturing the visible tab, and the pages this runs on carry names,
 * locations and phone numbers. A debug build that holds screenshots is a
 * different object from one that reads the DOM, so:
 *
 *   off by default          the option says what it does in its own label
 *   only on an explicit copy the `prepare` hook runs on ⧉ and nowhere else;
 *                           a hover never captures, whatever is armed
 *   one pixel, then gone    the image is drawn to a 1×1 context, one pixel
 *                           read, and every reference dropped in the same
 *                           breath — nothing is stored, nothing is sent
 *   said out loud           the report states that a capture was taken
 *
 * `activeTab`, not a host permission: it is granted by pressing the toolbar
 * button, covers the one tab, and expires. `<all_urls>` would buy the same
 * capability by asking every user for permanent read access to every site —
 * the exact privacy object the gating exists to avoid.
 */
export const Sample = {
  at: null,     // { px, py, rgb } — the last pixel read, for the point it was read at
  why: null,    // why the last attempt could not answer

  /** Is this build even able to ask? A store or sideload build has the
   *  permission; the dev page and the suite do not, and must say so rather
   *  than appear to have measured something. */
  capable: () => typeof chrome !== 'undefined' && !!(chrome.runtime && chrome.runtime.id),

  forget() { Sample.at = null; Sample.why = null; },

  /** The pixel for the CURRENT probe point, or null. Never recomputed from a
   *  stale point: a sample belongs to the pixel it was taken at. */
  current() {
    const p = Probe.at;
    if (!p || !Sample.at) return null;
    return (Sample.at.px === p.px && Sample.at.py === p.py) ? Sample.at : null;
  },
};

/**
 * Hook: the copy waits on this. Returns nothing — what it produces is read
 * out of Sample by the report lines, the same way the walk's own results are.
 */
/**
 * NOTHING, OR A PROMISE OF SOMETHING — deliberately, and it is the same
 * shape Sweep.run() uses for the same reason. A copy with no capture wanted
 * must stay exactly as synchronous as it has always been: awaiting an async
 * function that immediately returns still costs a microtask, and every
 * reader of the clipboard would have to learn to wait for a hop it never
 * needed. Only a run that will really capture hands back a promise.
 */
export function prepare() {
  Sample.forget();
  const p = Probe.point();
  if (!p) return null;
  if (!Tools.setting(this, 'sample')) return null;     // off: no capture, ever
  if (!Sample.capable()) {
    Sample.why = 'this build has no extension runtime to capture through';
    return null;
  }
  return (async () => {
    try {
      const url = await ask();
      const rgb = await pixel(url, p.x, p.y);
      if (rgb) Sample.at = { px: Probe.at.px, py: Probe.at.py, rgb };
      else Sample.why = 'the capture arrived but that pixel could not be read';
    } catch (e) {
      Sample.why = explain(String((e && e.message) || e));
    }
  })();
}

/**
 * CHROME'S SENTENCE, TURNED INTO AN INSTRUCTION.
 *
 * "Either the '<all_urls>' or 'activeTab' permission is required" is true and
 * useless: the manifest DOES ask for activeTab, so a reader concludes the
 * build is broken. What actually happened is that activeTab is not a standing
 * permission — it is granted when you invoke the extension from Chrome's own
 * chrome (the toolbar button), covers that one tab, and is dropped when the
 * tab navigates to another origin. Pressing ⧉ on the page is not an
 * invocation of the extension, so on its own it never grants anything.
 *
 * That is the price of not asking for <all_urls>, and it is the right price —
 * but only if the report says which button to press. The raw text is kept in
 * parentheses because it is the evidence.
 */
function explain(raw) {
  if (/activeTab|all_urls|permission/i.test(raw)) {
    return 'activeTab has not been granted for this tab — press the Debug Overlay ' +
      'toolbar button here, then copy again. It is granted by invoking the extension ' +
      'from the toolbar, covers this one tab, and is dropped when the tab changes ' +
      `origin; ⧉ on the page is not an invocation. (Chrome said: ${raw})`;
  }
  return raw || 'the tab could not be captured';
}

/** Ask the worker, which is the only side that may capture. */
function ask() {
  return new Promise((resolve, reject) => {
    let done = false;
    const give = (fn, v) => { if (!done) { done = true; fn(v); } };
    setTimeout(() => give(reject, new Error('the worker did not answer in time')), 4000);
    try {
      chrome.runtime.sendMessage({ type: 'debug-overlay-capture' }, (r) => {
        if (chrome.runtime.lastError) return give(reject, new Error(chrome.runtime.lastError.message));
        if (!r || !r.ok) return give(reject, new Error((r && r.error) ||
          'the tab could not be captured'));
        give(resolve, r.url);
      });
    } catch (e) { give(reject, e); }
  });
}

/**
 * One pixel out of the capture, and then nothing.
 *
 * The image is drawn at an offset so the wanted pixel lands on a 1×1 canvas:
 * no full-size buffer is ever allocated, so there is no frame to leak even
 * for the instant it would otherwise exist. Device pixels, because a capture
 * is in them and the probe is in CSS pixels.
 */
function pixel(url, x, y) {
  return new Promise((resolve) => {
    let img = new Image();
    let settled = false;
    const done = (v) => {
      if (settled) return;
      settled = true;
      if (img) { img.onload = img.onerror = null; img.src = ''; img = null; }
      resolve(v);
    };
    /* A DECODE THAT NEVER ANSWERS would hang the copy for ever: prepare() is
       awaited, so a promise that never settles is a report that never lands
       and a ⧉ that never finishes. onerror covers a bad URL; nothing covers
       a decoder that simply goes quiet, so this does. */
    setTimeout(() => done(null), 4000);
    img.onerror = () => done(null);
    img.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width = c.height = 1;
        const g = c.getContext('2d', { willReadFrequently: true });
        const r = devicePixelRatio || 1;
        g.drawImage(img, -Math.round(x * r), -Math.round(y * r));
        const d = g.getImageData(0, 0, 1, 1).data;
        done({ r: d[0], g: d[1], b: d[2] });
      } catch { done(null); }
    };
    img.src = url;
  });
}
