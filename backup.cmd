@echo off
rem Cold backup of the built-in PostgreSQL. Logic: deploy\windows\backup.ps1
rem Arguments are passed through, e.g.: backup.cmd -Destination D:\backup -Keep 30
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy\windows\backup.ps1" %*
exit /b %ERRORLEVEL%
