  /* ======================================================================
     7. DOM
     ====================================================================== */
  const root = document.createElement('div');
  root.id = '__dbgov-root';
  root.setAttribute('aria-hidden', 'true');
  const style = document.createElement('style');
  // core stylesheet + whatever each registered tool brings with it
  style.textContent = CSS + TOOLS.map((t) => t.css || '').join('\n');
  const layer = document.createElement('div');
  root.append(style, layer);
  document.documentElement.append(root);
