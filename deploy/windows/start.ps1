# Запуск на Windows без Docker: встроенный PostgreSQL, сборка при необходимости, приложение в фоне.
# Параметры: -Rebuild — пересобрать принудительно. Перед первым запуском нужен setup.cmd.
param([switch]$Rebuild)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')
. (Join-Path $PSScriptRoot 'build-tools.ps1')
. (Join-Path $PSScriptRoot 'postgres-tools.ps1')

# Приложение само ждёт PostgreSQL до минуты (DB_CONNECT_RETRIES × DB_CONNECT_RETRY_DELAY_MS).
$HealthTimeoutSeconds = 90

function Start-App {
  $outLog = Join-Path $LogDir 'app.log'
  $errLog = Join-Path $LogDir 'app.err.log'
  Move-OldLog $outLog
  Move-OldLog $errLog

  # Переменные окружения процесса важнее .env: путь к фронту всегда абсолютный.
  $env:STATIC_DIR = $WebDist
  $env:NODE_ENV = 'production'
  $arguments = "--env-file=`"$EnvFile`" --enable-source-maps dist\main.js"
  $process = Start-Process -FilePath 'node' -ArgumentList $arguments -WorkingDirectory $ServerDir `
    -WindowStyle Hidden -RedirectStandardOutput $outLog -RedirectStandardError $errLog -PassThru
  Set-Content -Path $PidFile -Value $process.Id -Encoding ASCII
  return $process
}

function Wait-Healthy($Process, [string]$Port) {
  $url = "http://127.0.0.1:$Port/api/health"
  $deadline = (Get-Date).AddSeconds($HealthTimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    if ($Process.HasExited) { return $false }
    try {
      $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 3
      if ($response.StatusCode -eq 200) { return $true }
    } catch {
      # Сервер ещё поднимается или ждёт PostgreSQL.
    }
    Start-Sleep -Seconds 2
  }
  return $false
}

try {
  New-Item -ItemType Directory -Force -Path $RunDir, $LogDir | Out-Null
  Assert-EnvFile
  Assert-PostgresReady
  $port = Get-EnvValue 'PORT' '3000'
  # PostgreSQL поднимаем и тогда, когда приложение уже работает: вдруг база остановилась отдельно.
  Start-Postgres (Get-DatabaseSettings) | Out-Null

  $running = Get-RunningApp
  if ($running) {
    Write-Host "Приложение уже запущено (PID $($running.Id)): http://$($env:COMPUTERNAME):$port" -ForegroundColor Green
    exit 0
  }

  Assert-Node
  $commit = Get-SourceCommit
  if ($Rebuild -or (Test-BuildNeeded $commit)) { Invoke-Build $commit }

  Write-Step 'Запускаем приложение'
  $process = Start-App
  if (-not (Wait-Healthy $process $port)) {
    Write-Failure "приложение не ответило за $HealthTimeoutSeconds с. Последние строки журнала ошибок:"
    Get-Content (Join-Path $LogDir 'app.err.log') -Tail 20 -ErrorAction SilentlyContinue
    Stop-App
    exit 1
  }

  Write-Host ''
  Write-Host "Готово. Адрес в локальной сети: http://$($env:COMPUTERNAME):$port" -ForegroundColor Green
  Write-Host "На этом компьютере: http://localhost:$port"
  Write-Host "Журналы: $LogDir. Остановка: stop.cmd"
  exit 0
} catch {
  Write-Failure $_.Exception.Message
  exit 1
}
