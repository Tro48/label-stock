# Проверка Node.js, установка зависимостей и сборка. Подключается через dot-source после common.ps1.

$MinNodeMajor = 22

function Assert-Node {
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw "Node.js не найден. Установите Node.js $MinNodeMajor LTS с https://nodejs.org и откройте окно заново."
  }
  $major = [int](& node -p "process.versions.node.split('.')[0]")
  if ($major -lt $MinNodeMajor) {
    throw "Нужен Node.js $MinNodeMajor или новее, установлен $(& node --version)."
  }
}

function Get-SourceCommit {
  if (-not (Get-Command git -ErrorAction SilentlyContinue)) { return 'unknown' }
  # Папка без .git (проект скачан ZIP-архивом) — штатный случай.
  $commit = Invoke-Quietly { & git -C $Root rev-parse HEAD }
  if ($LASTEXITCODE -ne 0 -or -not $commit) { return 'unknown' }
  return "$commit".Trim()
}

# Пересобираем, если сборки нет или после git pull изменился коммит.
function Test-BuildNeeded([string]$Commit) {
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
    # Не через корневой «pnpm build»: он вызывает pnpm изнутри, а при запуске через corepack
    # команды pnpm в PATH нет. Порядок тот же, что в корневом package.json.
    Invoke-Pnpm @('--filter', '@label-stock/web', 'build')
    Invoke-Pnpm @('--filter', '@label-stock/server', 'build')
  } finally {
    Pop-Location
  }
  Set-Content -Path $BuildStampFile -Value $Commit -Encoding ASCII
}
