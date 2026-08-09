
  /* ======================================================================
    15. BOOT — wire the modules together and start
     ====================================================================== */
  Panel.onToggle = Controller.togglePower;
  Panel.onTool = Controller.toggleTool;
  Panel.onDetail = Controller.toggleDetail;
  Panel.onCopy = Report.copy;
  Panel.onClear = Controller.clearPins;
  Panel.onListOpen = () => Panel.setList(Controller.pinList());
  Panel.onRowActivate = Controller.revealRow;
  Panel.onRowRemove = Controller.removeRow;

  Controller.loadTools();
  Interactions.install(Controller);
  Controller.setPower(false);
})();
