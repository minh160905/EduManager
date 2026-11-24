@echo off
chcp 65001 >nul
title EduManager - He Thong Quan Ly Hoc Sinh THPT

echo ========================================================
echo   DANG KHOI DONG HE THONG QUAN LY VA DANH GIA HOC SINH THPT
echo ========================================================
echo.

set PATH=C:\Program Files\nodejs;%PATH%

:: 1. Kiem tra va khoi dong MariaDB neu chua chay
tasklist /fi "imagename eq mysqld.exe" | find /i "mysqld.exe" >nul
if errorlevel 1 (
    echo [1/4] Dang khoi dong MariaDB Database...
    start /min "MariaDB Server" "D:\LDPlayer\mariadb-10.11.8-winx64\bin\mysqld.exe" --datadir="D:\LDPlayer\mariadb-data" --port=3306
    timeout /t 3 /nobreak >nul
) else (
    echo [1/4] MariaDB Database da dang chay.
)

:: 2. Khoi dong Backend Server
echo [2/4] Dang khoi dong Backend Server (Port 5000)...
start "EduManager Backend" cmd /k "cd /d %~dp0backend && npm run dev"
timeout /t 3 /nobreak >nul

:: 3. Khoi dong Frontend Server
echo [3/4] Dang khoi dong Frontend Server (Port 5173)...
start "EduManager Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"
timeout /t 3 /nobreak >nul

:: 4. Mo trinh duyet
echo [4/4] Dang mo trinh duyet...
start http://localhost:5173/

echo.
echo ========================================================
echo   KHOI DONG HOAN TAT!
echo   He thong dang chay tai: http://localhost:5173
echo ========================================================
echo.
pause
