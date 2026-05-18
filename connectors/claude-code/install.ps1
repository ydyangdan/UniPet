param(
    [switch]$NoStart,
    [string]$SettingsPath = "",
    [string]$UnipetCommand = "unipet"
)

$ErrorActionPreference = "Stop"

$ConnectorRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$Installer = Join-Path $ConnectorRoot "install.js"

if (-not (Test-Path $Installer)) {
    throw "Claude Code connector installer not found: $Installer"
}

$NodeCommand = Get-Command node -ErrorAction SilentlyContinue
if (-not $NodeCommand) {
    throw "Node.js was not found on PATH. Install Node.js 18+ before setting up UniPet."
}

$args = @($Installer)
if ($NoStart) {
    $args += "--no-start"
}
if ($SettingsPath -and $SettingsPath.Trim().Length -gt 0) {
    $args += "--settings"
    $args += $SettingsPath
}
if ($UnipetCommand -and $UnipetCommand.Trim().Length -gt 0) {
    $args += "--unipet-command"
    $args += $UnipetCommand
}

& $NodeCommand.Source @args
