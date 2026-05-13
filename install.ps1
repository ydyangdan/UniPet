param(
    [switch]$NoLaunch,
    [switch]$NoHermesSkill
)

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Overlay = Join-Path $Root "overlay"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw "Node.js was not found. Install Node.js 18+ first."
}

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    throw "npm was not found. Install Node.js/npm first."
}

Push-Location $Overlay
npm install
npm link
Pop-Location

$NpmPrefix = (& npm prefix -g).Trim()
$NpmUnipet = Join-Path $NpmPrefix "unipet.cmd"
$ResolvedUnipet = Get-Command unipet -ErrorAction SilentlyContinue
$UnipetCommand = "unipet"

if ($ResolvedUnipet -and $ResolvedUnipet.Source -and -not $ResolvedUnipet.Source.StartsWith($NpmPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
    Write-Warning "Another unipet command is first on PATH: $($ResolvedUnipet.Source)"
    Write-Warning "Using npm-linked UniPet for this installer: $NpmUnipet"
    $UnipetCommand = $NpmUnipet
}

if (-not $NoHermesSkill) {
    & (Join-Path $Root "connectors\hermes\install.ps1") -NoLaunch
}

if (-not $NoLaunch) {
    & $UnipetCommand launch
}

& $UnipetCommand doctor
