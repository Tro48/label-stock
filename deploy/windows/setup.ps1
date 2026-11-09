# Первичная установка на Windows без Docker: проверка окружения, PostgreSQL, .env, база, сборка.
# Повторный запуск безопасен: готовые шаги пропускаются. Им же обновляется PostgreSQL после git pull.

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')
. (Join-Path $PSScriptRoot 'build-tools.ps1')
. (Join-Path $PSScriptRoot 'postgres-tools.ps1')

try {
  New-Item -ItemType Directory -Force -Path $RunDir, $LogDir | Out-Null
  Assert-Node
  Assert-VcRuntime
  if (-not (Get-Command tar.exe -ErrorAction SilentlyContinue)) {
    throw 'Не найден tar.exe. Нужна Windows 10 версии 1803 или новее.'
  }

  Install-PostgresRuntime
  New-EnvFile
  $database = Get-DatabaseSettings
  Invoke-Build (Get-SourceCommit)

  Initialize-PostgresCluster $database
  $startedHere = Start-Postgres $database
  try {
    Initialize-AppDatabase
  } finally {
    if ($startedHere) { Stop-Postgres }
  }

  Write-Host ''
  Write-Host 'Установка завершена. Запуск приложения: start.cmd' -ForegroundColor Green
  Write-Host "Данные базы: $PgDataDir. Не удаляйте эту папку, бэкап — backup.cmd."
  exit 0
} catch {
  Write-Failure $_.Exception.Message
  exit 1
}
