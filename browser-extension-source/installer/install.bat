@echo off
rem  Debug Overlay - extension installer (Windows).
rem  Does everything a file is ALLOWED to do; the browser's own security
rem  reserves the final two clicks for a human - no installer anywhere can
rem  add an extension silently, and that is a feature, not our choice.
setlocal
set "DEST=%LOCALAPPDATA%\debug-overlay-extension"

echo.
echo  Debug Overlay - browser extension setup
echo  ---------------------------------------
echo  Installing files to: %DEST%
robocopy "%~dp0." "%DEST%" /MIR /XF install.bat /NFL /NDL /NJH /NJS >nul
if errorlevel 8 (
  echo  Could not copy files. Close programs using that folder and retry.
  pause
  exit /b 1
)
echo  Done.
echo.
echo  The extensions page opens now. TWO clicks remain - the browser
echo  requires a human for both:
echo.
echo    1. Switch ON "Developer mode"  (top-right toggle)
echo    2. Click "Load unpacked" and select this folder:
echo       %DEST%
echo.
echo  Afterwards, on any website, press Alt+Shift+D.
echo.
echo  Optional, once - makes every future update one press inside the
echo  overlay: extension's Details -^> Extension options -^>
echo  "Choose install folder..." -^> select the same folder -^> Allow.
echo.
start chrome "chrome://extensions/" 2>nul || start msedge "edge://extensions/" 2>nul
pause
