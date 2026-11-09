# Общие пути и функции для start.ps1 и stop.ps1. Совместимо с Windows PowerShell 5.1.

$Root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$RunDir = Join-Path $Root 'run'
$LogDir = Join-Path $Root 'logs'
$PidFile = Join-Path $RunDir 'app.pid'
$EnvFile = Join-Path $Root '.env'
$EnvTemplate = Join-Path $PSScriptRoot 'env.example'
$BuildStampFile = Join-Path $RunDir 'build-commit'
$ServerDir = Join-Path $Root 'apps\server'
$WebDist = Join-Path $Root 'apps\web\dist'

function Write-Step([string]$Message) {
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Write-Failure([string]$Message) {
  Write-Host "Ошибка: $Message" -ForegroundColor Red
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

# Значение переменной из .env (строки вида KEY=value, # — комментарий).
function Get-EnvValue([string]$Name, [string]$Default) {
  if (Test-Path $EnvFile) {
    foreach ($line in Get-Content $EnvFile) {
      if ($line -match "^\s*$Name\s*=\s*(.*?)\s*$") { return $Matches[1] }
    }
  }
  return $Default
}
