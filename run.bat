@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required. Install the LTS version from https://nodejs.org/
  pause
  exit /b 1
)

if not exist .env (
  copy .env.example .env >nul
  echo First run: configure your PostgreSQL connection in the .env file.
  start /wait notepad.exe .env
)

if not exist node_modules (
  echo Installing dependencies...
  call npm.cmd install
  if errorlevel 1 goto failed
)

echo Starting Ledgerly at http://localhost:5173
call npm.cmd run dev
exit /b %errorlevel%

:failed
echo Dependency installation failed. Check your internet connection and try again.
pause
exit /b 1