@echo off
setlocal
cd /d "%~dp0"
title Vinay Number Guessing Activity - Launch & Share
cls
echo ======================================================================
echo                 VINAY NUMBER GUESSING ACTIVITY
echo                 Developed by Vinay
echo ======================================================================
echo.

:: Detect Python command
set PYTHON_CMD=
where py >nul 2>&1 && set PYTHON_CMD=py
if "%PYTHON_CMD%"=="" (
    where python >nul 2>&1 && set PYTHON_CMD=python
)

if not "%PYTHON_CMD%"=="" (
    echo [*] Starting Vinay Number Guessing Game with Auto-Tunnel...
    echo.
    %PYTHON_CMD% launcher.py
    goto :END
)

:: Fallback if Python is not in PATH
echo [1/2] Checking local game server on port 8000...
netstat -ano | findstr :8000 | findstr LISTENING >nul
if %ERRORLEVEL% equ 0 (
    echo [OK] Game server is already running!
) else (
    echo [!] Starting server directly...
    start /b python run.py >nul 2>&1
    timeout /t 2 /nobreak >nul
)

echo.
echo [2/2] Generating instant online share link via SSH Tunnel...
echo ----------------------------------------------------------------------
echo NOTE: Keep this window open while playing with your friend!
echo       Copy the https://... link below and send it to your friend:
echo ----------------------------------------------------------------------
echo.

ssh -o StrictHostKeyChecking=no -o ServerAliveInterval=30 -R 80:127.0.0.1:8000 nokey@localhost.run

:END
echo.
echo Server session ended.
pause
