# Creates a "VehicleCare" shortcut with the app icon on the desktop.
$launcher = Join-Path $PSScriptRoot 'start-vehiclecare.ps1'
$icon = Join-Path $PSScriptRoot 'vehiclecare.ico'
$root = Split-Path -Parent $PSScriptRoot
$desktop = [Environment]::GetFolderPath('Desktop')   # also works when the desktop is in OneDrive
$path = Join-Path $desktop 'VehicleCare.lnk'

$shell = New-Object -ComObject WScript.Shell
$s = $shell.CreateShortcut($path)
$s.TargetPath = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$s.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$launcher`""
$s.WorkingDirectory = $root
$s.IconLocation = "$icon,0"
$s.Description = 'Start VehicleCare'
$s.WindowStyle = 7
$s.Save()

Add-Type -AssemblyName PresentationFramework
[System.Windows.MessageBox]::Show("The VehicleCare icon is now on your desktop.`n`nDouble-click it to start the app.", 'VehicleCare', 'OK', 'Information') | Out-Null
