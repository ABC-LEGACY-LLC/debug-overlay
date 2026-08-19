import { CONFIG } from '../core/config.js';
import { defineTool } from '../core/registry.js';
  defineTool({
    // visuals owned by this tool — appended to the stylesheet at boot
    css: `
    .dbgov-badge .dup { color: #ff8a65; font-weight: 700; }
    `,
      id: 'dupid',
      // not ⧉ — the copy button already uses that glyph, and two identical
      // icons in one bar is a bar you have to read twice
      icon: '⌗',
      title: 'Duplicate ids — the same id used more than once',

      rules: {
        'dup-id': {
          help: 'An id must be unique in a document.',
          why: 'getElementById, label[for], aria-labelledby and every #anchor ' +
               'resolve to the first match and silently ignore the rest, so the ' +
               'bug shows up as a control that does nothing rather than an error.',
          docs: 'https://developer.mozilla.org/docs/Web/HTML/Global_attributes/id',
        },
      },

      /**
       * PAGE hook. This is the shape of question audit(info) cannot ask: an
       * element with a duplicated id looks perfectly correct on its own, and
       * only the second one makes either of them wrong. Nothing about the
       * element is the problem — the page is.
       */
      auditPage(all) {
        const by = new Map();
        for (const i of all) {
          const id = i.el.id;
          if (!id) continue;
          (by.get(id) || by.set(id, []).get(id)).push(i.el);
        }
        const out = [];
        for (const [id, els] of by) {
          if (els.length < 2) continue;
          out.push({
            el: els[0],
            verdict: 'fail',
            // a broken label or anchor is a control that does nothing, and
            // nothing on screen says so
            severity: 'error',
            rule: 'dup-id',
            message: `id "${id}" is used ${els.length} times`,
            // by id, not by element: the duplicates are one mistake
            key: `dup-id|${id}`,
          });
        }
        return out;
      },

      /**
       * What it has to say about the element you are pointing AT. It knew this
       * all along and only ever said it in the copied report — hover a element
       * whose id is used three times and the badge was silent, which is the
       * one place you were looking.
       */
      badge({ el }) {
        if (!el.id) return null;
        const n = document.querySelectorAll(
          `[id="${CSS.escape ? CSS.escape(el.id) : el.id}"]`).length;
        return n > 1 ? `<span class="dup">⌗ id ×${n}</span>` : null;
      },
      compact(i) { return this.badge(i); },

      /**
       * ITS OWN SURFACE. Findings reach the ⌕ list whether a rule is armed or
       * not, so a rule with no draw() changed nothing at all when you switched
       * it on — measured: armed alone, zero badges, zero marks, zero lines. A
       * toggle that does nothing is worse than no toggle.
       *
       * `found` is this tool's own findings, handed over by the renderer. The
       * mark classes are core: more than one rule paints them, so they cannot
       * belong to whichever tool needed them first.
       */
      draw({ layer, Place, found }) {
        for (const f of found.slice(0, CONFIG.MARK_LIMIT)) {
          if (!document.contains(f.el)) continue;
          const r = f.el.getBoundingClientRect();
          const box = document.createElement('div');
          box.className = 'dbgov-box dbgov-flag ' + f.severity;
          Place.put(box, r.left, r.top, r.width, r.height);
          layer.append(box);
        }
      },

      report({ el }) {
        if (!el.id) return [];
        const n = document.querySelectorAll(`[id="${CSS.escape ? CSS.escape(el.id) : el.id}"]`).length;
        return n > 1 ? [`  ⧉ id "${el.id}" is used ${n} times on this page`] : [];
      },
    });
