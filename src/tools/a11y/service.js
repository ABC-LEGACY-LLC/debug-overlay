/**
 * NAME · ROLE · FOCUSABLE — the three facts a screen reader acts on, read
 * off the rendered page.
 *
 * These are computed, not authored. `<button><span class="icon"/></button>`
 * has no name; `<div role="button" aria-label="Close">` has one. Neither is
 * visible in the source at a glance, which is why this belongs in an
 * instrument rather than a linter — and why the badge shows all three even
 * when nothing is wrong.
 *
 * WHAT THIS IS NOT. The accessible-name spec is long, and this is a subset
 * of it. That is fine as long as the subset never returns a confident wrong
 * answer: where the real algorithm would look somewhere this cannot see —
 * across a shadow boundary, chiefly — it reports `unsure` and the rule turns
 * that into `review`, not into a failure. A name we could not compute and a
 * name that is missing are different findings, and a tool that blurs them
 * would fill an audit with work that does not exist.
 */

/** Content name: text and image alternatives, minus anything hidden. */
function textOf(el, depth = 0) {
  if (!el || depth > 6) return '';
  // an aria-hidden subtree contributes nothing to a name, the same way it
  // contributes nothing to the tree — this is the rule the overlay's own
  // panel once broke on itself
  if (el.getAttribute && el.getAttribute('aria-hidden') === 'true') return '';
  const own = el.getAttribute && el.getAttribute('aria-label');
  if (own && own.trim()) return own.trim();
  let out = '';
  for (const n of el.childNodes) {
    if (n.nodeType === 3) out += n.nodeValue;
    else if (n.nodeType === 1) {
      if (n.tagName === 'IMG') { out += ' ' + (n.getAttribute('alt') || ''); continue; }
      /* An <svg> names itself through its <title>, and that title WINS over
         any other content it holds — verified against Chrome, which names
         `<svg><title>Save</title><text>XYZ</text></svg>` "Save" and not
         "Save XYZ". Recursing into the svg as ordinary text finds the title
         too, so the simple case agrees either way; this branch is here for
         the case where it does not. */
      if (n.tagName === 'svg' || n.tagName === 'SVG') {
        const ti = n.querySelector && n.querySelector('title');
        out += ' ' + (ti ? ti.textContent : '');
        continue;
      }
      out += ' ' + textOf(n, depth + 1);
    }
  }
  return out.replace(/\s+/g, ' ').trim();
}

/** The `<label>` that points at a form control, either way round. */
function labelFor(el) {
  if (el.id) {
    const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
    if (l) return textOf(l);
  }
  const wrap = el.closest && el.closest('label');
  return wrap ? textOf(wrap) : '';
}

const FIELD = /^(INPUT|SELECT|TEXTAREA|METER|PROGRESS|OUTPUT)$/;
// roles whose name may come from their own content. Everything else has to
// be labelled explicitly — a <div role="region"> full of text is not named
// "all the text inside it".
const FROM_CONTENT = new Set(['button', 'link', 'heading', 'option', 'menuitem',
  'menuitemcheckbox', 'menuitemradio', 'tab', 'treeitem', 'cell', 'columnheader',
  'rowheader', 'gridcell', 'switch', 'checkbox', 'radio', 'tooltip', 'legend']);

const BY_TAG = {
  A: (el) => (el.hasAttribute('href') ? 'link' : 'generic'),
  AREA: (el) => (el.hasAttribute('href') ? 'link' : 'generic'),
  BUTTON: () => 'button',
  IMG: (el) => (el.getAttribute('alt') === '' ? 'presentation' : 'img'),
  SELECT: (el) => (el.multiple || el.size > 1 ? 'listbox' : 'combobox'),
  TEXTAREA: () => 'textbox',
  NAV: () => 'navigation', MAIN: () => 'main', ASIDE: () => 'complementary',
  FORM: () => 'form', SEARCH: () => 'search', DIALOG: () => 'dialog',
  UL: () => 'list', OL: () => 'list', LI: () => 'listitem',
  TABLE: () => 'table', TR: () => 'row', TD: () => 'cell', TH: () => 'columnheader',
  P: () => 'paragraph', HR: () => 'separator', PROGRESS: () => 'progressbar',
  H1: () => 'heading', H2: () => 'heading', H3: () => 'heading',
  H4: () => 'heading', H5: () => 'heading', H6: () => 'heading',
  HEADER: (el) => (el.closest('article, aside, main, nav, section') ? 'generic' : 'banner'),
  FOOTER: (el) => (el.closest('article, aside, main, nav, section') ? 'generic' : 'contentinfo'),
  DIV: () => 'generic', SPAN: () => 'generic',
  INPUT: (el) => ({
    button: 'button', submit: 'button', reset: 'button', image: 'button',
    checkbox: 'checkbox', radio: 'radio', range: 'slider', number: 'spinbutton',
    search: 'searchbox', email: 'textbox', tel: 'textbox', text: 'textbox',
    url: 'textbox', password: null, hidden: null,
  }[(el.getAttribute('type') || 'text').toLowerCase()] ?? 'textbox'),
};

export const A11y = {
  /** The role the browser exposes: what was declared, or what the tag means. */
  role(el) {
    const explicit = (el.getAttribute('role') || '').trim().split(/\s+/)[0];
    if (explicit) return explicit.toLowerCase();
    const fn = BY_TAG[el.tagName];
    return fn ? fn(el) : null;
  },

  /**
   * Is it in the TAB ORDER — reachable by keyboard, not merely focusable by
   * script. `tabindex="-1"` is a deliberate "focus me from code only", which
   * is not a defect and must not be reported as one.
   */
  focusable(el, cs) {
    if (el.disabled || el.hasAttribute('inert') || el.closest('[inert]')) return false;
    if (cs && (cs.display === 'none' || cs.visibility === 'hidden')) return false;
    return typeof el.tabIndex === 'number' && el.tabIndex >= 0;
  },

  /** True when an ancestor (or the element) is hidden from the tree. */
  hidden(el) {
    return !!(el.closest && el.closest('[aria-hidden="true"]'));
  },

  /**
   * The accessible name, in the spec's order, stopping at the first source
   * that yields text. Returns `{ name, from, unsure }` — `unsure` is set
   * only when a source was ATTEMPTED and could not be read from here.
   */
  name(el) {
    /* aria-labelledby first — and when it resolves to nothing it FALLS
       THROUGH, which is what the algorithm says and what Chrome does. This
       used to stop there and report "not determined", so
       `<button aria-labelledby="typo">×</button>` — which Chrome names "×"
       from its own content — came back as a review row. A dead reference is
       not the same as an unnameable element; only an element that reaches
       the END with nothing is unnameable, and only then is it worth saying
       we could not read the reference. */
    const lb = (el.getAttribute('aria-labelledby') || '').trim();
    let tried = null;
    if (lb) {
      const ids = lb.split(/\s+/).filter(Boolean);
      const seen = ids.map((id) => document.getElementById(id)).filter(Boolean);
      const s = seen.map((n) => textOf(n)).join(' ').replace(/\s+/g, ' ').trim();
      if (s) return { name: s, from: 'aria-labelledby', unsure: null };
      if (!seen.length) tried = 'labelledby';
    }
    const al = (el.getAttribute('aria-label') || '').trim();
    if (al) return { name: al, from: 'aria-label', unsure: null };

    if (el.tagName === 'IMG' || el.tagName === 'AREA' ||
        (el.tagName === 'INPUT' && (el.getAttribute('type') || '').toLowerCase() === 'image')) {
      const alt = el.getAttribute('alt');
      // alt="" is a DECISION — "this image says nothing" — and naming it a
      // missing name would punish the correct way to mark decoration.
      if (alt !== null) return { name: alt.trim(), from: 'alt', unsure: null };
      return { name: '', from: null, unsure: null };
    }
    if (FIELD.test(el.tagName)) {
      const l = labelFor(el);
      if (l) return { name: l, from: 'label', unsure: null };
      const ph = (el.getAttribute('placeholder') || '').trim();
      if (ph) return { name: ph, from: 'placeholder', unsure: null };
    }
    if (el.tagName === 'FIELDSET') {
      const lg = el.querySelector('legend');
      if (lg) return { name: textOf(lg), from: 'legend', unsure: null };
    }
    if (el.tagName === 'TABLE') {
      const cap = el.querySelector('caption');
      if (cap) return { name: textOf(cap), from: 'caption', unsure: null };
    }
    const role = A11y.role(el);
    if (role && FROM_CONTENT.has(role)) {
      const s = textOf(el);
      if (s) return { name: s, from: 'content', unsure: null };
    }
    const ti = (el.getAttribute('title') || '').trim();
    if (ti) return { name: ti, from: 'title', unsure: null };
    // Nothing named it. If a reference was attempted and could not be
    // resolved, we genuinely cannot tell whether this is unnamed or whether
    // the label lives somewhere this pass cannot reach.
    return { name: '', from: null, unsure: tried };
  },

  /** Everything the badge and the rules need, computed once per element. */
  of(el, cs) {
    const n = A11y.name(el);
    return { name: n.name, from: n.from, unsure: n.unsure,
             role: A11y.role(el), focusable: A11y.focusable(el, cs) };
  },

  why: {
    labelledby: 'aria-labelledby names ids that are not in this document — ' +
                'either they are wrong, or they sit inside a shadow root ' +
                'this pass cannot read',
  },
};
