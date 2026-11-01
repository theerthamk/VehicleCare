@echo off
REM Run this ONCE. It puts a VehicleCare icon on your desktop.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0create-shortcut.ps1"
