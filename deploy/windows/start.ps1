# Запуск приложения на Windows без Docker: сборка при необходимости, запуск в фоне, проверка здоровья.
# Параметры: -Rebuild — пересобрать принудительно.
param([switch]$Rebuild)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')

$MinNodeMajor = 22
# Приложение само ждёт PostgreSQL до минуты (DB_CONNECT_RETRIES × DB_CONNECT_RETRY_DELAY_MS).
$HealthTimeoutSeconds = 90
$MaxLogBytes = 10MB

function Assert-Node {
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw "Node.js не найден. Установите Node.js $MinNodeMajor LTS с https://nodejs.org и откройте окно заново."
  }
  $major = [int](& node -p "process.versions.node.split('.')[0]")
  if ($major -lt $MinNodeMajor) {
    throw "Нужен Node.js $MinNodeMajor или новее, установлен $(& node --version)."
  }
}

function Assert-EnvFile {
  if (Test-Path $EnvFile) { return }
  Copy-Item $EnvTemplate $EnvFile
  throw "Создан файл $EnvFile из шаблона. Впишите в него пароль PostgreSQL (DATABASE_URL) и запустите снова."
}

function Get-SourceCommit {
  if (-not (Get-Command git -ErrorAction SilentlyContinue)) { return 'unknown' }
  # В Windows PowerShell 5.1 перенаправленный stderr при ErrorActionPreference=Stop становится
  # исключением; папка без .git — штатный случай, поэтому на время вызова ослабляем режим.
  $previousPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $commit = & git -C $Root rev-parse HEAD 2>$null
  } finally {
    $ErrorActionPreference = $previousPreference
  }
  if ($LASTEXITCODE -ne 0 -or -not $commit) { return 'unknown' }
  return "$commit".Trim()
}

# Пересобираем, если сборки нет или после git pull изменился коммит.
function Test-BuildNeeded([string]$Commit) {
  if ($Rebuild) { return $true }
  if (-not (Test-Path (Join-Path $ServerDir 'dist\main.js'))) { return $true }
  if (-not (Test-Path (Join-Path $WebDist 'index.html'))) { return $true }
  if (-not (Test-Path $BuildStampFile)) { return $true }
  return (Get-Content $BuildStampFile -Raw).Trim() -ne $Commit
}

function Invoke-Pnpm([string[]]$Arguments) {
  if (Get-Command corepack -ErrorAction SilentlyContinue) {
    # corepack входит в Node.js 22 и запускает pnpm версии из package.json без глобальной установки.
    # Без этой переменной первый запуск спросит разрешение на скачивание и зависнет в Планировщике.
    $env:COREPACK_ENABLE_DOWNLOAD_PROMPT = '0'
    & corepack pnpm @Arguments
  } elseif (Get-Command pnpm -ErrorAction SilentlyContinue) {
    & pnpm @Arguments
  } else {
    throw 'Не найден ни corepack, ни pnpm. Установите pnpm: npm install -g pnpm'
  }
  if ($LASTEXITCODE -ne 0) { throw "Команда «pnpm $($Arguments -join ' ')» завершилась с ошибкой." }
}

function Invoke-Build([string]$Commit) {
  Write-Step 'Устанавливаем зависимости'
  Push-Location $Root
  try {
    Invoke-Pnpm @('install', '--frozen-lockfile')
    Write-Step 'Собираем приложение'
    Invoke-Pnpm @('build')
  } finally {
    Pop-Location
  }
  Set-Content -Path $BuildStampFile -Value $Commit -Encoding ASCII
}

function Move-OldLog([string]$Path) {
  if ((Test-Path $Path) -and (Get-Item $Path).Length -gt $MaxLogBytes) {
    Move-Item $Path "$Path.1" -Force
  }
}

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
  $port = Get-EnvValue 'PORT' '3000'

  $running = Get-RunningApp
  if ($running) {
    Write-Host "Приложение уже запущено (PID $($running.Id)): http://$($env:COMPUTERNAME):$port" -ForegroundColor Green
    exit 0
  }

  Assert-Node
  Assert-EnvFile
  $commit = Get-SourceCommit
  if (Test-BuildNeeded $commit) { Invoke-Build $commit }

  Write-Step 'Запускаем приложение'
  $process = Start-App
  if (-not (Wait-Healthy $process $port)) {
    Write-Failure "приложение не ответило за $HealthTimeoutSeconds с. Последние строки журнала ошибок:"
    Get-Content (Join-Path $LogDir 'app.err.log') -Tail 20 -ErrorAction SilentlyContinue
    if (-not $process.HasExited) { Stop-Process -Id $process.Id -Force }
    Remove-Item $PidFile -ErrorAction SilentlyContinue
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
