@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "SOURCE=%~dp0site"
set "DEST=\\NasChapron\web\portailClub"
set "LOGDIR=%~dp0deploy_logs"
if not exist "%LOGDIR%" mkdir "%LOGDIR%"
for /f "usebackq delims=" %%T in (`powershell -NoProfile -Command "Get-Date -Format 'yyyyMMdd_HHmmss'"`) do set "LOGTS=%%T"
set "LOGFILE=%LOGDIR%\deploy_portailClub_!LOGTS!.log"

echo ============================================
echo Deploiement Portail Club vers %DEST%
echo Journal : %LOGFILE%
echo ============================================

if not exist "%SOURCE%\index.html" (
  echo [ERREUR] Source introuvable : %SOURCE%
  exit /b 1
)

if not exist "%DEST%" (
  echo [INFO] Creation destination...
  mkdir "%DEST%" 2>nul
)

robocopy "%SOURCE%" "%DEST%" /MIR /R:2 /W:3 /XD ".git" "deploy_logs" /XF "config.local.php" /NFL /NDL /NJH /NJS /NC /NS /NP >>"%LOGFILE%" 2>&1
set "RC=%ERRORLEVEL%"
if %RC% GEQ 8 (
  echo [ERREUR] Robocopy code %RC% — voir %LOGFILE%
  exit /b %RC%
)

echo [INFO] Generation version.json (%LOGTS%) sur NAS...
powershell -NoProfile -Command "$v = @{ version = '%LOGTS%'; builtAt = (Get-Date -Format 'o'); label = (Get-Date -Format 'dd/MM/yyyy HH:mm') }; $json = $v | ConvertTo-Json -Compress; [IO.File]::WriteAllText('%DEST%\version.json',$json,[Text.UTF8Encoding]::new($false))"

echo [INFO] Cache-bust __BUILD_VERSION__ = %LOGTS% sur NAS...
powershell -NoProfile -Command "$bv='%LOGTS%'; $dest='%DEST%'; $files=@((Join-Path $dest 'apps\formations\index.html'),(Join-Path $dest 'apps\materiel\index.html'),(Join-Path $dest 'apps\cdm2026\index.html'),(Join-Path $dest 'index.html'),(Join-Path $dest 'install.html')); foreach($f in $files){ if(Test-Path $f){ $c=[IO.File]::ReadAllText($f,[Text.UTF8Encoding]::new($false)) -replace '__BUILD_VERSION__',$bv; [IO.File]::WriteAllText($f,$c,[Text.UTF8Encoding]::new($false)) } }"

echo [OK] Deploiement termine — https://diveapps.serveblog.net/portailClub/
exit /b 0
