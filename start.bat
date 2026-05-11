@echo off
chcp 65001 >nul 2>&1
title Novel Continuation System
cd /d "%~dp0"

echo.
echo  ========================================
echo    Novel Continuation System - Starting
echo  ========================================
echo.

echo [1/5] Cleaning up...
:: Kill processes on ports 8000 and 5173
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":8000 " ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":5173 " ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
)
:: Clean Python cache
cd /d "%~dp0backend"
for /f "delims=" %%d in ('dir /s /b /ad __pycache__ 2^>nul') do rd /s /q "%%d" >nul 2>&1
cd /d "%~dp0"
echo       Cleanup done.

echo.
echo [2/5] Checking Python venv...
if not exist "%~dp0backend\.venv\Scripts\python.exe" (
    echo       venv not found, creating...
    python -m venv "%~dp0backend\.venv"
    if errorlevel 1 (
        echo [ERROR] Failed to create venv.
        pause
        exit /b 1
    )
)
echo       OK

echo.
echo [3/5] Installing backend dependencies...
cd /d "%~dp0backend"
call .venv\Scripts\pip.exe install -r requirements.txt -q 2>nul
echo       OK

echo.
echo [4/5] Installing frontend dependencies...
cd /d "%~dp0frontend"
call npm install --silent 2>nul
echo       OK

echo.
echo  ========================================
echo    Starting services...
echo  ========================================
echo.

echo [5/5] Starting backend...
cd /d "%~dp0backend"
start "Novel Backend" cmd /k ".venv\Scripts\python.exe main.py"
echo       Waiting for backend...
timeout /t 8 /nobreak >nul

echo       Starting frontend (browser will open automatically)...
cd /d "%~dp0frontend"
start "Novel Frontend" cmd /k "npm run dev"

echo.
echo  ========================================
echo    All services started!
echo    Backend:  http://localhost:8000
echo    Frontend: http://localhost:5173
echo  ========================================
echo.
echo  You can close this window.
pause
