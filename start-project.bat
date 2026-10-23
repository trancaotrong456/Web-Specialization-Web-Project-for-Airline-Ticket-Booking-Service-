@echo off
title Airline Booking - Start Development
cd /d "%~dp0"

echo ============================================================
echo   Airline Booking - Docker Dev Setup
echo ============================================================
echo.

echo [1/4] Kiem tra Docker...
docker info >nul 2>&1
if errorlevel 1 (
    echo [LOI] Docker chua chay. Hay mo Docker Desktop truoc.
    pause
    exit /b 1
)

echo [2/4] Khoi dong MySQL + Backend (Docker Compose)...
docker compose up -d
if errorlevel 1 (
    echo [LOI] Docker Compose khoi dong that bai.
    pause
    exit /b 1
)

echo.
echo [3/4] Setup demo data (tu dong tao env + seed tai khoan demo)...
echo       Cho API container san sang (co the mat 20-30 giay)...

:: Doi cho API container healthy (thu toi da 30 lan, moi lan 3 giay)
set /a attempt=0
:wait_loop
set /a attempt+=1
if %attempt% gtr 30 (
    echo [CANH BAO] API chua healthy sau 90 giay. Bo qua buoc seed.
    goto skip_seed
)
docker compose ps api | findstr "healthy" >nul 2>&1
if errorlevel 1 (
    timeout /t 3 /nobreak >nul
    goto wait_loop
)

:: Chay seed
node scripts/setup-demo-env.js
if errorlevel 1 (
    echo [CANH BAO] Khong tao duoc demo-seed.local.env.
    goto skip_seed
)

npm run seed:demo:docker -- --apply
if errorlevel 1 (
    echo [CANH BAO] Seed demo that bai hoac da co du lieu. Tiep tuc...
)

:skip_seed
echo.
echo [4/4] Khoi dong Frontend...
if exist "frontend\package.json" (
    pushd frontend
    start "Airline Booking Frontend" cmd /k "npm run dev"
    popd
) else (
    echo       Frontend chua duoc cai dat - bo qua.
)

echo.
echo ============================================================
echo   THONG TIN TRUY CAP
echo ============================================================
echo   Backend API : http://localhost:5000/api/v1
echo   Frontend    : http://localhost:5173
echo   API Docs    : http://localhost:5000/api/v1/health
echo.
echo   TAI KHOAN DEMO:
echo     Admin    : admin@airline-booking.local
echo     Password : Admin123456
echo.
echo     Staff    : staff.demo@airline-booking.local
echo     Password : Staff123456
echo.
echo     Customer : customer.demo@airline-booking.local
echo     Password : Customer123456
echo ============================================================
echo.
pause
