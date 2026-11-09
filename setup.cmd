@echo off
rem First-time setup on Windows without Docker: PostgreSQL, .env, database, build.
rem Logic: deploy\windows\setup.ps1. Safe to run again.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy\windows\setup.ps1"
set EXIT_CODE=%ERRORLEVEL%
pause
exit /b %EXIT_CODE%
