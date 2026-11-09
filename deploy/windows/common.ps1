# Общие пути и функции для скриптов в deploy\windows. Совместимо с Windows PowerShell 5.1.

$Root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$RunDir = Join-Path $Root 'run'
$LogDir = Join-Path $Root 'logs'
$PidFile = Join-Path $RunDir 'app.pid'
$EnvFile = Join-Path $Root '.env'
$EnvTemplate = Join-Path $PSScriptRoot 'env.example'
$BuildStampFile = Join-Path $RunDir 'build-commit'
$ServerDir = Join-Path $Root 'apps\server'
$WebDist = Join-Path $Root 'apps\web\dist'
$MaxLogBytes = 10MB

function Write-Step([string]$Message) {
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Write-Failure([string]$Message) {
  Write-Host "Ошибка: $Message" -ForegroundColor Red
}

# В Windows PowerShell 5.1 перенаправленный stderr внешней программы при ErrorActionPreference=Stop
# становится исключением. Для команд, у которых ненулевой код — штатный ответ, ослабляем режим.
# Код возврата остаётся в $LASTEXITCODE.
function Invoke-Quietly([scriptblock]$Command) {
  $previousPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    & $Command 2>$null
  } finally {
    $ErrorActionPreference = $previousPreference
  }
}

# Значение переменной из .env (строки вида KEY=value, # — комментарий).
function Get-EnvValue([string]$Name, [string]$Default) {
  if (Test-Path $EnvFile) {
    foreach ($line in Get-Content $EnvFile -Encoding UTF8) {
      if ($line -match "^\s*$Name\s*=\s*(.*?)\s*$") { return $Matches[1] }
    }
  }
  return $Default
}

function Assert-EnvFile {
  if (-not (Test-Path $EnvFile)) {
    throw 'Не найден файл .env. Сначала запустите setup.cmd.'
  }
}

function Move-OldLog([string]$Path) {
  if ((Test-Path $Path) -and (Get-Item $Path).Length -gt $MaxLogBytes) {
    Move-Item $Path "$Path.1" -Force
  }
}

# Процесс приложения по PID-файлу. Проверяем имя процесса: после перезагрузки Windows
# тот же PID мог достаться другой программе, её останавливать нельзя.
function Get-RunningApp {
  if (-not (Test-Path $PidFile)) { return $null }
  $savedPid = (Get-Content $PidFile -Raw).Trim()
  if (-not $savedPid) { return $null }
  $process = Get-Process -Id ([int]$savedPid) -ErrorAction SilentlyContinue
  if ($process -and $process.ProcessName -eq 'node') { return $process }
  return $null
}

function Stop-App {
  $process = Get-RunningApp
  if ($process) {
    Write-Step "Останавливаем приложение (PID $($process.Id))"
    # Транзакции в PostgreSQL атомарны: при остановке незавершённая операция просто откатится.
    Stop-Process -Id $process.Id -Force
    $process.WaitForExit(10000) | Out-Null
  }
  Remove-Item $PidFile -ErrorAction SilentlyContinue
}
