# Остановка приложения, запущенного через start.ps1. PostgreSQL не трогаем: это отдельная служба Windows.

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')

try {
  $process = Get-RunningApp
  if (-not $process) {
    Remove-Item $PidFile -ErrorAction SilentlyContinue
    Write-Host 'Приложение не запущено.' -ForegroundColor Yellow
    exit 0
  }

  Write-Step "Останавливаем приложение (PID $($process.Id))"
  # Транзакции в PostgreSQL атомарны: при остановке незавершённая операция просто откатится.
  Stop-Process -Id $process.Id -Force
  $process.WaitForExit(10000) | Out-Null
  Remove-Item $PidFile -ErrorAction SilentlyContinue
  Write-Host 'Приложение остановлено.' -ForegroundColor Green
  exit 0
} catch {
  Write-Failure $_.Exception.Message
  exit 1
}
