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
   * WHAT A BOX TAKES — two questions, and they are independent.
   *
   * REACH is which boxes count. `enclosed` is what a marquee usually means
   * and it cannot take anything bigger than the drag: a full-width wallpaper
   * is unreachable, because enclosing it means dragging a box around it, and
   * it may be larger than the viewport. `touched` takes anything the box
   * overlaps at all, down to one pixel, so a big element is taken by dragging
   * INSIDE it.
   *
   * KEEP is which of those survive, and it is a separate axis because under
   * `touched` every ancestor up to <body> overlaps too. These shipped as one
   * four-valued setting, which made choosing overlap also mean "prune
   * nothing" — every wrapper between <body> and the thing you wanted.
   *
   * `touched` + `deepest` is the pairing for a large element, and neither
   * half of it can be said with one setting.
   */
  options() {
    return [
      { key: 'reach', label: 'A box takes what it', def: 'enclosed',
        values: ['enclosed', 'touched'], affects: 'select' },
      { key: 'take', label: '…and keeps the', def: 'outermost',
        values: ['outermost', 'deepest', 'every'], affects: 'select' },
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
