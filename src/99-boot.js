
  /* ======================================================================
    16. BOOT — wire the modules together and start
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
  Panel.onRowChange = Controller.changeSetting;

  // before loadTools: a tool's options decide what its rules do, and arming
  // one immediately schedules a render that asks
  Controller.loadSettings();
  Controller.loadTools();
  Interactions.install(Controller);
  Controller.setPower(false);
})();
