# Бэкап встроенного PostgreSQL. В сборке нет pg_dump, поэтому делаем холодную копию: на время
# архивации приложение и база останавливаются (обычно несколько секунд), затем запускаются снова.
# Параметры: -Destination — папка для архивов (по умолчанию BACKUP_DIR из .env или backups\),
# -Keep — сколько последних архивов хранить.
param([string]$Destination, [int]$Keep = 14)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')
. (Join-Path $PSScriptRoot 'postgres-tools.ps1')

$ArchivePrefix = 'label-stock_'

function Remove-OldBackups([string]$Directory) {
  Get-ChildItem -Path $Directory -Filter "$ArchivePrefix*.tar.gz" |
    Sort-Object Name -Descending |
    Select-Object -Skip $Keep |
    Remove-Item
}

try {
  Assert-EnvFile
  Assert-PostgresReady
  if (-not $Destination) { $Destination = Get-EnvValue 'BACKUP_DIR' (Join-Path $Root 'backups') }
  New-Item -ItemType Directory -Force -Path $Destination | Out-Null
  $archive = Join-Path $Destination "$ArchivePrefix$(Get-Date -Format 'yyyy-MM-dd_HHmmss').tar.gz"

  $appWasRunning = [bool](Get-RunningApp)
  $postgresWasRunning = Test-PostgresRunning
  Stop-App
  Stop-Postgres
  try {
    Write-Step "Архивируем базу в $archive"
    & tar.exe -czf $archive -C $PgDataParent (Split-Path $PgDataDir -Leaf)
    if ($LASTEXITCODE -ne 0) {
      Remove-Item $archive -ErrorAction SilentlyContinue
      throw 'Не удалось создать архив.'
    }
  } finally {
    # Возвращаем то состояние, которое было до бэкапа, даже если архивация не удалась.
    if ($appWasRunning) {
      & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'start.ps1')
      if ($LASTEXITCODE -ne 0) { throw 'Приложение не запустилось после бэкапа. Запустите start.cmd.' }
    } elseif ($postgresWasRunning) {
      Start-Postgres (Get-DatabaseSettings) | Out-Null
    }
  }

  Remove-OldBackups $Destination
  Write-Host "Бэкап готов: $archive" -ForegroundColor Green
  exit 0
} catch {
  Write-Failure $_.Exception.Message
  exit 1
}
