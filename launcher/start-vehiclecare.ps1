# VehicleCare launcher (Windows)
# Starts the server if it is not already running, then opens the app in its own window.
# Run through the desktop shortcut or "Start VehicleCare.bat".

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
Add-Type -AssemblyName PresentationFramework

function Show-Box([string]$message, [string]$icon) {
  [System.Windows.MessageBox]::Show($message, 'VehicleCare', 'OK', $icon) | Out-Null
}
function Fail([string]$message) {
  Show-Box $message 'Error'
  exit 1
}

if (-not (Test-Path (Join-Path $root '.env'))) {
  Fail "The .env file is missing in:`n$root`n`nCopy your .env file into this folder, then try again."
}

# Read PORT from .env (default 3000)
$port = 3000
foreach ($line in Get-Content (Join-Path $root '.env')) {
  if ($line -match '^\s*PORT\s*=\s*"?(\d+)"?\s*$') { $port = [int]$Matches[1] }
}
$url = "http://localhost:$port"

function Test-Listening {
  return [bool](Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
}

# Returns 'ok', 'nodb' or 'other' (another program is using the port)
function Get-Health {
  try {
    $h = Invoke-RestMethod -Uri "$url/api/health" -TimeoutSec 5
    if ($h.database -eq 'connected') { return 'ok' }
    return 'nodb'
  } catch {
    $status = 0
    if ($_.Exception.Response) { $status = [int]$_.Exception.Response.StatusCode }
    if ($status -eq 503) { return 'nodb' }
    return 'other'
  }
}

if (-not (Test-Listening)) {
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Fail "Node.js is not installed. Install the LTS version from nodejs.org, then try again."
  }
  if (-not (Test-Path (Join-Path $root 'node_modules'))) {
    $install = Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', 'title Installing VehicleCare && npm.cmd install' -WorkingDirectory $root -Wait -PassThru
    if ($install.ExitCode -ne 0) { Fail "npm install failed. Open PowerShell in`n$root`nand run: npm.cmd install" }
  }

  # Start the server in its own minimized window (closing that window stops the app).
  Start-Process -FilePath 'cmd.exe' -ArgumentList '/k', 'title VehicleCare server - keep this window open && npm.cmd start' -WorkingDirectory $root -WindowStyle Minimized

  $started = $false
  for ($i = 0; $i -lt 40; $i++) {
    Start-Sleep -Milliseconds 500
    if (Test-Listening) { $started = $true; break }
  }
  if (-not $started) {
    Fail "The server did not start.`n`nClick the 'VehicleCare server' window on the taskbar to see the error."
  }
  Start-Sleep -Milliseconds 700
}

switch (Get-Health) {
  'other' {
    Fail "Port $port is being used by another program, not VehicleCare.`n`nOpen the .env file, change PORT to 3001, save it, and click the VehicleCare icon again."
  }
  'nodb' {
    Show-Box "VehicleCare is running, but MySQL is not connected.`n`nPress Win + R, type services.msc, start the MySQL80 service, then refresh the app." 'Warning'
  }
}

# Open as an app window: Chrome, then Edge, then the default browser.
$opened = $false
foreach ($browser in @('chrome', 'msedge')) {
  try {
    Start-Process -FilePath $browser -ArgumentList "--app=$url" -ErrorAction Stop
    $opened = $true
    break
  } catch { }
}
if (-not $opened) { Start-Process $url }
