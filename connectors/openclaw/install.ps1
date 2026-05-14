param(
    [switch]$NoStart,
    [switch]$NoEnable,
    [switch]$SkipValidate,
    [switch]$Copy,
    [string]$OpenClawCommand = "openclaw",
    [string]$UnipetCommand = "unipet"
)

$ErrorActionPreference = "Stop"

$ConnectorRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$PluginDir = Join-Path $ConnectorRoot "plugin"

if (-not (Test-Path $PluginDir)) {
    throw "OpenClaw plugin directory not found: $PluginDir"
}

if (-not (Get-Command $OpenClawCommand -ErrorAction SilentlyContinue)) {
    throw "OpenClaw command was not found. Install OpenClaw or pass -OpenClawCommand."
}

$installArgs = @("plugins", "install")
if (-not $Copy) {
    $installArgs += "-l"
}
$installArgs += $PluginDir

Write-Host "Installing UniPet OpenClaw plugin from $PluginDir"
& $OpenClawCommand @installArgs

if (-not $NoEnable) {
    Write-Host "Enabling unipet-openclaw"
    & $OpenClawCommand plugins enable unipet-openclaw
}

if (-not $SkipValidate) {
    Write-Host "Validating OpenClaw config"
    & $OpenClawCommand config validate
}

if (-not $NoStart) {
    if (Get-Command $UnipetCommand -ErrorAction SilentlyContinue) {
        Write-Host "Starting UniPet"
        & $UnipetCommand start
    } else {
        Write-Warning "UniPet command was not found on PATH. Run 'unipet start' after installing the UniPet runtime."
    }
}

Write-Host "UniPet OpenClaw plugin is installed. Restart OpenClaw Gateway so startup hooks are loaded."
