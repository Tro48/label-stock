# Встроенный PostgreSQL: бинарники из npm-пакета, данные в папке проекта, запуск через pg_ctl.
# Подключается через dot-source после common.ps1.
#
# Установщик EDB недоступен из части сетей, а npm-реестр доступен везде, где ставятся зависимости.
# Пакет @embedded-postgres/windows-x64 содержит готовые initdb, pg_ctl и postgres (без psql и pg_dump),
# поэтому базу создаёт create-database.mjs, а бэкап — холодная копия папки данных (backup.ps1).

$PgPackage = '@embedded-postgres/windows-x64'
# Мажорную версию менять только с переносом данных: папка данных PostgreSQL 17 не откроется в 18.
$PgPackageVersion = '17.11.0-beta.19'
$PgMajorVersion = '17'

$PgRuntimeDir = Join-Path $Root 'vendor\postgres'
$PgRuntimeStamp = Join-Path $PgRuntimeDir 'package-version'
$PgCtl = Join-Path $PgRuntimeDir 'bin\pg_ctl.exe'
$PgInitDb = Join-Path $PgRuntimeDir 'bin\initdb.exe'
$PgDataParent = Join-Path $Root 'data'
$PgDataDir = Join-Path $PgDataParent 'postgres'
$PgLogFile = Join-Path $LogDir 'postgres.log'
$PgStartTimeoutSeconds = 60

# Параметры подключения берём из DATABASE_URL в .env, чтобы они не расходились с приложением.
function Get-DatabaseSettings {
  $url = Get-EnvValue 'DATABASE_URL' ''
  if (-not $url) { throw 'В .env не задан DATABASE_URL.' }
  $uri = [System.Uri]$url
  $credentials = $uri.UserInfo.Split(':', 2)
  if ($uri.Host -notin @('127.0.0.1', 'localhost')) {
    throw "DATABASE_URL указывает на $($uri.Host), а встроенный PostgreSQL работает только на 127.0.0.1."
  }
  if ($credentials.Count -ne 2 -or $credentials[1] -notmatch '^[A-Za-z0-9]+$') {
    throw 'Пароль в DATABASE_URL должен состоять из латинских букв и цифр. Удалите .env и запустите setup.cmd: пароль сгенерируется сам.'
  }
  $port = if ($uri.Port -gt 0) { $uri.Port } else { 5432 }
  return @{ User = $credentials[0]; Password = $credentials[1]; Port = $port }
}

function New-RandomPassword {
  $bytes = New-Object byte[] 24
  $generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try { $generator.GetBytes($bytes) } finally { $generator.Dispose() }
  return ($bytes | ForEach-Object { $_.ToString('x2') }) -join ''
}

# .env создаём из шаблона со случайным паролем. Без BOM: так его однозначно читает node --env-file.
function New-EnvFile {
  if (Test-Path $EnvFile) { return }
  Write-Step 'Создаём .env со случайным паролем базы'
  $template = Get-Content $EnvTemplate -Raw -Encoding UTF8
  $content = $template.Replace('GENERATED_BY_SETUP', (New-RandomPassword))
  [System.IO.File]::WriteAllText($EnvFile, $content, (New-Object System.Text.UTF8Encoding $false))
}

# Без Visual C++ Redistributable postgres.exe падает с ошибкой об отсутствии VCRUNTIME140.dll.
function Assert-VcRuntime {
  if (-not (Test-Path (Join-Path $env:SystemRoot 'System32\vcruntime140.dll'))) {
    throw 'Не установлен Microsoft Visual C++ Redistributable (x64), без него PostgreSQL не запустится. Установите https://aka.ms/vs/17/release/vc_redist.x64.exe и запустите setup.cmd снова.'
  }
}

function Test-PostgresRuntimeCurrent {
  if (-not (Test-Path $PgCtl) -or -not (Test-Path $PgRuntimeStamp)) { return $false }
  return (Get-Content $PgRuntimeStamp -Raw).Trim() -eq $PgPackageVersion
}

function Test-PostgresRunning {
  if (-not (Test-Path $PgCtl) -or -not (Test-Path $PgDataDir)) { return $false }
  Invoke-Quietly { & $PgCtl status -D $PgDataDir } | Out-Null
  return $LASTEXITCODE -eq 0
}

function Install-PostgresRuntime {
  if (Test-PostgresRuntimeCurrent) { return }
  if (Test-PostgresRunning) {
    throw 'Чтобы обновить PostgreSQL, сначала остановите его: stop.cmd.'
  }
  Write-Step "Скачиваем PostgreSQL ($PgPackage@$PgPackageVersion)"
  $downloadDir = Join-Path $RunDir 'postgres-download'
  Remove-Item $downloadDir -Recurse -Force -ErrorAction SilentlyContinue
  New-Item -ItemType Directory -Force -Path $downloadDir | Out-Null
  try {
    # npm pack только скачивает архив (с проверкой контрольной суммы) и не запускает скрипты пакета.
    Push-Location $downloadDir
    try {
      & npm pack "$PgPackage@$PgPackageVersion" --silent | Out-Null
      if ($LASTEXITCODE -ne 0) { throw 'npm не смог скачать пакет PostgreSQL. Проверьте доступ к registry.npmjs.org.' }
    } finally {
      Pop-Location
    }
    $archive = Get-ChildItem -Path $downloadDir -Filter '*.tgz' | Select-Object -First 1
    # tar.exe входит в Windows 10 (1803+) и Windows 11.
    & tar.exe -xzf $archive.FullName -C $downloadDir
    if ($LASTEXITCODE -ne 0) { throw 'Не удалось распаковать архив PostgreSQL.' }
    Remove-Item $PgRuntimeDir -Recurse -Force -ErrorAction SilentlyContinue
    New-Item -ItemType Directory -Force -Path (Split-Path $PgRuntimeDir) | Out-Null
    Move-Item (Join-Path $downloadDir 'package\native') $PgRuntimeDir
    Set-Content -Path $PgRuntimeStamp -Value $PgPackageVersion -Encoding ASCII
  } finally {
    Remove-Item $downloadDir -Recurse -Force -ErrorAction SilentlyContinue
  }
}

function Assert-PostgresReady {
  if (-not (Test-PostgresRuntimeCurrent)) {
    throw 'PostgreSQL не установлен или устарел. Запустите setup.cmd.'
  }
  $versionFile = Join-Path $PgDataDir 'PG_VERSION'
  if (-not (Test-Path $versionFile)) {
    throw 'База не создана. Запустите setup.cmd.'
  }
  $dataVersion = (Get-Content $versionFile -Raw).Trim()
  if ($dataVersion -ne $PgMajorVersion) {
    throw "Папка данных создана PostgreSQL $dataVersion, а установлен $PgMajorVersion. Нужен перенос данных через бэкап."
  }
}

# Кластер инициализируется один раз. Владелец — пользователь приложения: кластер служит только
# этому приложению и слушает лишь 127.0.0.1. Провайдер локали builtin (PostgreSQL 17) не зависит
# от языковых настроек Windows и правильно переводит кириллицу в нижний регистр для поиска.
function Initialize-PostgresCluster($Database) {
  if (Test-Path (Join-Path $PgDataDir 'PG_VERSION')) { return }
  if ((Test-Path $PgDataDir) -and (Get-ChildItem $PgDataDir -Force | Select-Object -First 1)) {
    throw "Папка $PgDataDir не пуста, но базы в ней нет (прерванная установка?). Удалите её и запустите setup.cmd снова."
  }
  Write-Step 'Создаём базу данных PostgreSQL'
  New-Item -ItemType Directory -Force -Path $PgDataParent | Out-Null
  $passwordFile = Join-Path $RunDir 'initdb-password.txt'
  Set-Content -Path $passwordFile -Value $Database.Password -Encoding ASCII -NoNewline
  try {
    & $PgInitDb -D $PgDataDir -U $Database.User "--pwfile=$passwordFile" --auth=scram-sha-256 `
      --encoding=UTF8 --locale=C --locale-provider=builtin --builtin-locale=C.UTF-8 | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'initdb завершился с ошибкой.' }
  } finally {
    Remove-Item $passwordFile -ErrorAction SilentlyContinue
  }
}

function Get-PostgresLogTail {
  return (Get-Content $PgLogFile -Tail 20 -ErrorAction SilentlyContinue) -join [Environment]::NewLine
}

# Возвращает $true, если PostgreSQL запущен этим вызовом.
function Start-Postgres($Database) {
  if (Test-PostgresRunning) { return $false }
  Write-Step "Запускаем PostgreSQL (порт $($Database.Port))"
  Move-OldLog $PgLogFile
  $arguments = "start -D `"$PgDataDir`" -l `"$PgLogFile`" -w -t $PgStartTimeoutSeconds " +
    "-o `"-p $($Database.Port) -c listen_addresses=127.0.0.1`""
  # Отдельное скрытое окно: postgres не должен завершиться, когда закроют окно start.cmd.
  # Start-Process -Wait здесь нельзя: в PowerShell 5.1 он ждёт и дочерние процессы, то есть сам postgres.
  $process = Start-Process -FilePath $PgCtl -ArgumentList $arguments -WindowStyle Hidden -PassThru
  $null = $process.Handle # без этого PowerShell 5.1 может не отдать ExitCode
  if (-not $process.WaitForExit(($PgStartTimeoutSeconds + 15) * 1000) -or $process.ExitCode -ne 0) {
    throw "PostgreSQL не запустился. Последние строки $($PgLogFile):$([Environment]::NewLine)$(Get-PostgresLogTail)"
  }
  return $true
}

function Stop-Postgres {
  if (-not (Test-PostgresRunning)) { return }
  Write-Step 'Останавливаем PostgreSQL'
  # fast: активные транзакции откатываются, данные на диске согласованы.
  Invoke-Quietly { & $PgCtl stop -D $PgDataDir -m fast -w -t $PgStartTimeoutSeconds } | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "PostgreSQL не остановился. Журнал: $PgLogFile" }
}

# psql в сборке нет, поэтому базу приложения создаём через драйвер pg из apps\server.
function Initialize-AppDatabase {
  & node "--env-file=$EnvFile" (Join-Path $PSScriptRoot 'create-database.mjs')
  if ($LASTEXITCODE -ne 0) { throw 'Не удалось создать базу приложения.' }
}
