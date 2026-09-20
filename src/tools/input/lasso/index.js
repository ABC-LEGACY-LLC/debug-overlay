import { defineTool } from '../../../core/registry.js';
import { watch, unwatch, intercept, Drag } from './drag.js';
import { draw } from './draw.js';

/* index — REGISTRATION ONLY. The tool's behaviour lives in the files beside
   this one; what is declared here is identity, appearance and wiring. */
const tool = defineTool({
  css: `
  .debug-overlay-lasso { position: fixed; pointer-events: none;
    border: 1px solid var(--debug-overlay-accent);
    background: rgba(181,232,83,.10); border-radius: var(--debug-overlay-r-inner); }
  `,
  id: 'lasso',
  family: 'input',   // audited: must match the domain folder this sits in
  icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11V8a2 2 0 0 0-2-2h-6l-2-2H5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h3"/><path d="M14 13v8"/><path d="M10 17h8"/></svg>',   // lucide 'folder-plus' turned marquee
  title: 'Lasso — drag a box and keep everything inside it',
  /* NOT startsOn. Every click on the page already means something, and a
     gesture that reinterprets drags is not one to switch on for somebody who
     did not ask for it. */

  watch,
  unwatch,
  intercept,
  draw,

  /**
   * THE DECLARATION THAT CANNOT BE DERIVED. Everything else this tool
   * implements is generic — a runtime, a claim on one click, a rectangle —
   * and none of it says the product is PINS. Without this the role came out
   * Act, off the `intercept` that exists only to swallow the click its own
   * drag caused, and the panel dressed a selection tool as a component.
   */
  selects() { return true; },

  /**
   * WHAT A BOX TAKES, and it is a real choice rather than a preference.
   *
   * A rectangle over one card contains the card and every node inside it. The
   * default keeps only the outermost of them — "the things in this region" —
   * because the alternative is dozens of pins for one drag with the one you
   * wanted buried among them. The other readings exist because neither is
   * always wrong, and this is the kind of thing that must be changeable from
   * the panel rather than by a rebuild.
   */
  options() {
    return [
      { key: 'take', label: 'A box keeps', def: 'outermost',
        values: ['outermost', 'leaves', 'every', 'touching'], affects: 'select' },
    ];
  },

  /** The gesture this adds — declared where it lives, so the KEYS legend
   *  learns it without any core file holding a list. */
  gestures() {
    return [{ keys: 'Drag on the page (▭ armed)',
              does: 'keep everything the box takes — including what a click cannot reach' }];
  },
});
Drag.tool = tool;   // the runtime reads its own setting through the registry
