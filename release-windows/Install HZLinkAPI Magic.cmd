@echo off
setlocal
chcp 65001 >nul
set "HZLM_ARCH=x64"
if /I "%PROCESSOR_ARCHITECTURE%"=="ARM64" set "HZLM_ARCH=arm64"
if /I "%PROCESSOR_ARCHITEW6432%"=="ARM64" set "HZLM_ARCH=arm64"
if not exist "%~dp0runtime\%HZLM_ARCH%\node.exe" (
  echo Please extract the entire ZIP before running this installer.
  pause
  exit /b 1
)
"%~dp0runtime\%HZLM_ARCH%\node.exe" "%~dp0install.mjs"
set "HZLM_EXIT=%ERRORLEVEL%"
echo.
pause
exit /b %HZLM_EXIT%
