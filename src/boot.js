
  /* ======================================================================
    BOOT — wire the modules together and start
     ====================================================================== */
  Panel.onToggle = Controller.togglePower;
  Panel.onTool = Controller.toggleTool;
  Panel.onDetail = Controller.toggleDetail;
  Panel.onCopy = Report.copy;
  Panel.onSweep = Controller.sweep;
  Panel.onClear = Controller.clearPins;
  Panel.onListOpen = (view) =>
    Panel.setList(Controller.rows(view), Controller.emptyFor(view));
  Panel.onRowActivate = Controller.revealRow;
  Panel.onRowRemove = Controller.removeRow;
  Panel.onRowChange = Controller.changeRow;

  // before loadTools: a tool's options decide what its rules do, and arming
  // one immediately schedules a render that asks
  // the page can remove a pinned element at any time; the list must not go on
  // showing rows that no longer index into anything
  Render.onPinsPruned = Controller.refreshList;

  Settings.load();
  Controller.loadTools();
  Interactions.install(Controller);
  Controller.setPower(false);
})();
