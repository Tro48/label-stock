@echo off
rem Start the app on Windows without Docker. Logic: deploy\windows\start.ps1
rem Arguments are passed through, e.g.: start.cmd -Rebuild
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy\windows\start.ps1" %*
set EXIT_CODE=%ERRORLEVEL%
rem Keep the window open to read the result; when run by Task Scheduler timeout exits at once.
if %EXIT_CODE% neq 0 (pause) else (timeout /t 15 >nul)
exit /b %EXIT_CODE%
