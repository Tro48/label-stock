@echo off
rem Stop the app and the built-in PostgreSQL. Logic: deploy\windows\stop.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy\windows\stop.ps1"
set EXIT_CODE=%ERRORLEVEL%
if %EXIT_CODE% neq 0 (pause) else (timeout /t 5 >nul)
exit /b %EXIT_CODE%
