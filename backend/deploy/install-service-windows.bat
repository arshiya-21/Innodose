@echo off
rem Installs Inodose as a Windows service: starts at boot, restarts automatically if it stops.
rem Run as Administrator. Needs nssm.exe (https://nssm.cc) in this folder or on PATH.
setlocal
cd /d "%~dp0"
net session >nul 2>&1 || (echo Please right-click and choose "Run as administrator". & pause & exit /b 1)
if not exist ".env" (echo Create .env first: copy .env.example to .env and edit it. & pause & exit /b 1)
where node >nul 2>&1 || (echo Node.js 20+ is not installed. & pause & exit /b 1)
set "NSSM=nssm"
if exist "%~dp0nssm.exe" set "NSSM=%~dp0nssm.exe"
where %NSSM% >nul 2>&1 || if not exist "%NSSM%" (echo nssm.exe not found. Download it from https://nssm.cc and put nssm.exe in this folder. & pause & exit /b 1)
for /f "delims=" %%N in ('where node') do set "NODE=%%N" & goto :got
:got
%NSSM% install Inodose "%NODE%" "%~dp0server.mjs"
%NSSM% set Inodose AppDirectory "%~dp0"
%NSSM% set Inodose Start SERVICE_AUTO_START
%NSSM% set Inodose AppExit Default Restart
%NSSM% set Inodose AppRestartDelay 5000
%NSSM% set Inodose AppStdout "%~dp0logs\inodose.log"
%NSSM% set Inodose AppStderr "%~dp0logs\inodose.log"
%NSSM% set Inodose AppRotateFiles 1
%NSSM% set Inodose AppRotateBytes 10485760
if not exist "%~dp0logs" mkdir "%~dp0logs"
%NSSM% start Inodose
echo.
echo Installed. Open http://localhost:5173/  ^|  Logs: %~dp0logs\inodose.log
pause
