@echo off
chcp 65001 >nul 2>&1
title Novel Continuation System
cd /d "%~dp0"

echo.
echo  ========================================
echo    Novel Continuation System - Starting
echo  ========================================
echo.

echo [1/4] Checking Python...
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python not found. Install Python 3.10+
    pause
    exit /b 1
)
echo       OK

echo [2/4] Checking Node.js...
node --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js not found. Install Node.js 18+
    pause
    exit /b 1
)
echo       OK

echo [3/4] Installing backend dependencies...
cd /d "%~dp0backend"
pip install -r requirements.txt -q 2>nul
echo       OK

echo [4/4] Installing frontend dependencies...
cd /d "%~dp0frontend"
if not exist "node_modules" (
    call npm install
) else (
    echo       node_modules exists, skipping
)
echo       OK

echo.
echo  ========================================
echo    Starting services...
echo    Browser will open automatically
echo    Press Ctrl+C to stop
echo  ========================================
echo.

:: Start backend in a separate window
cd /d "%~dp0backend"
start "novel-backend" cmd /k "title Novel Backend && python main.py"

:: Wait for backend to be ready
echo Waiting for backend to start...
timeout /t 3 /nobreak >nul

:: Start frontend (with open: true in vite.config, browser opens automatically)
cd /d "%~dp0frontend"
echo Starting frontend and opening browser...
call npm run dev
if errorlevel 1 (
    echo.
    echo [ERROR] Frontend failed to start
    pause
)
