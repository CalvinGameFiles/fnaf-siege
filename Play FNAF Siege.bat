@echo off
rem Opens the FNAF Siege desktop app (build it with: cd desktop ^&^& npm run build)
cd /d "%~dp0"
if exist "desktop\dist\FNAF Siege-win32-x64\FNAF Siege.exe" (
  start "" "desktop\dist\FNAF Siege-win32-x64\FNAF Siege.exe"
) else (
  node server.js --open
)
