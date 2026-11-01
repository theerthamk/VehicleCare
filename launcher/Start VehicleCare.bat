@echo off
REM Starts VehicleCare without the desktop icon.
powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0start-vehiclecare.ps1"
