  /* ======================================================================
     DOM
     ====================================================================== */
  const root = document.createElement('div');
  root.id = '__dbgov-root';
  root.setAttribute('aria-hidden', 'true');
  /**
   * One sheet per tool, plus the core — not one sheet for all of them.
   *
   * A CSS parser raises nothing when it gives up: it drops the broken rule
   * and everything after it in the same sheet. Concatenated, that meant an
   * unclosed paren in an early tool silently cost every later tool its
   * styling. That shipped once, and cost grid and contrast theirs entirely.
   * Separate sheets make the blast radius the author's own file.
   */
  const sheet = (css, owner) => {
    const s = document.createElement('style');
    if (owner) s.dataset.tool = owner;   // so a broken one can be named
    s.textContent = css;
    root.append(s);
  };
  sheet(CSS);
  for (const t of TOOLS) if (t.css) sheet(t.css, t.id);
  const layer = document.createElement('div');
  root.append(layer);
  document.documentElement.append(root);
