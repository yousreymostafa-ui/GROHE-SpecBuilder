@echo off
cd /d "%~dp0"
set "GROHE_IMAGES_DIR=G:\My Drive\Images"
where py >nul 2>nul
if %errorlevel%==0 (
  py -3 server.py
  exit /b
)
where python >nul 2>nul
if %errorlevel%==0 (
  python server.py
  exit /b
)
echo Python is required for automatic local image loading.
echo The app auto-loads product images from G:\My Drive\Images.
echo Data Sheets use the saved folder from Settings, defaulting to G:\My Drive\Data Sheets.
pause
