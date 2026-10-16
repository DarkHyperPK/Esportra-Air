@echo off
setlocal EnableExtensions DisableDelayedExpansion
cd /d "%~dp0"

set "HUD_DIR=%CD%\esportra-valorant-hud"
set "CAPTURE_DIR=%HUD_DIR%\capture\overwolf-valorant"

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js 18 or newer is required. Install it, then run test.bat again.
  exit /b 1
)

if not exist "%HUD_DIR%\node_modules\ws\package.json" (
  echo HUD dependencies are missing. Run npm install in "%HUD_DIR%" first.
  exit /b 1
)
if not exist "%CAPTURE_DIR%\node_modules\@overwolf\ow-electron\dist\electron.exe" (
  echo Capture dependencies are missing. Run npm install in "%CAPTURE_DIR%" first.
  exit /b 1
)

rem Prefer the current process value; otherwise read the saved per-user value.
rem On the first run, prompt without echoing the key and save it for future runs.
if not defined OW_DEV_KEY (
  for /f "usebackq delims=" %%K in (`powershell -NoProfile -Command "$value=[Environment]::GetEnvironmentVariable('OW_DEV_KEY','User'); if (-not $value) { $secure=Read-Host 'Overwolf developer key (saved for this Windows user)' -AsSecureString; $ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure); try { $value=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }; if ($value) { [Environment]::SetEnvironmentVariable('OW_DEV_KEY',$value,'User') } }; [Console]::WriteLine($value)"`) do set "OW_DEV_KEY=%%K"
)
if not defined OW_DEV_KEY (
  echo An Overwolf developer key is required to run GEP in development mode.
  exit /b 1
)

rem Refuse to attach capture to a different process already using the HUD port.
node -e "const s=require('net').connect(5300,'127.0.0.1');s.on('connect',()=>{s.destroy();process.exit(1)});s.on('error',()=>process.exit(0))"
if errorlevel 1 (
  echo Port 5300 is already in use. Close the other HUD process and try again.
  exit /b 1
)

if /i "%~1"=="--check" (
  echo Prerequisites are ready.
  exit /b 0
)

rem One temporary write key is shared by the HUD and capture child processes.
for /f "delims=" %%K in ('node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))"') do set "ESPORTRA_KEY=%%K"
set "ESPORTRA_MATCH=MAIN"
set "ESPORTRA_SERVER=ws://127.0.0.1:5300"

echo Starting HUD on http://localhost:5300 ...
start "Esportra HUD" /D "%HUD_DIR%" cmd /k node -e "require('./server/server').start({port:5300,key:process.env.ESPORTRA_KEY,root:process.cwd()})"

rem Wait until the server is actually responding before starting GEP capture.
node -e "let n=0;const t=setInterval(()=>{fetch('http://127.0.0.1:5300/health').then(r=>{if(r.ok){clearInterval(t);process.exit(0)}}).catch(()=>{});if(++n>=40){clearInterval(t);process.exit(1)}},250)"
if errorlevel 1 (
  echo HUD did not start. Check the Esportra HUD window for the error.
  exit /b 1
)

echo Starting Overwolf GEP capture in development mode ...
start "Esportra GEP Capture" /D "%CAPTURE_DIR%" cmd /k npm start

echo Opening the control panel ...
start "" "http://localhost:5300/control.html?match=MAIN&key=%ESPORTRA_KEY%"
echo OBS browser source: http://localhost:5300/overlays/ingame.html?match=MAIN
echo Launch Valorant on this PC and watch the capture window for GEP events.
echo Close both terminal windows to stop this test.
exit /b 0
