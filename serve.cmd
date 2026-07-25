@echo off
REM ResumeLoop - start a local server and open the app.
REM ES modules will not load from file://, so this is the way in.
cd /d "%~dp0"

set PORT=8777
echo.
echo   ResumeLoop  ^-^>  http://127.0.0.1:%PORT%/
echo   Press Ctrl+C to stop.
echo.

start "" http://127.0.0.1:%PORT%/

where python >nul 2>nul && (
  python -m http.server %PORT% --bind 127.0.0.1
  goto :eof
)
where py >nul 2>nul && (
  py -m http.server %PORT% --bind 127.0.0.1
  goto :eof
)
where npx >nul 2>nul && (
  npx --yes http-server -p %PORT% -a 127.0.0.1 -c-1
  goto :eof
)

echo   No Python or Node found. Install either one, or serve this folder
echo   with any static file server on port %PORT%.
pause
