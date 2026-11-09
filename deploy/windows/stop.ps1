# Остановка приложения и встроенного PostgreSQL, запущенных через start.ps1.

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')
. (Join-Path $PSScriptRoot 'postgres-tools.ps1')

try {
  $appWasRunning = [bool](Get-RunningApp)
  $postgresWasRunning = Test-PostgresRunning
  # Сначала приложение, чтобы оно не писало ошибки подключения в журнал.
  Stop-App
  Stop-Postgres

  if ($appWasRunning -or $postgresWasRunning) {
    Write-Host 'Приложение и база остановлены.' -ForegroundColor Green
  } else {
    Write-Host 'Приложение не запущено.' -ForegroundColor Yellow
  }
  exit 0
} catch {
  Write-Failure $_.Exception.Message
  exit 1
}
