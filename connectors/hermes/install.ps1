param(
    [string]$HermesHome = $env:HERMES_HOME,
    [switch]$NoLaunch
)

$ErrorActionPreference = "Stop"

if (-not $HermesHome -or $HermesHome.Trim().Length -eq 0) {
    $HermesHome = Join-Path $HOME ".hermes"
}

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Resolve-Path (Join-Path $ScriptDir "..\..")
$OverlayDir = Join-Path $ProjectRoot "overlay"
$SourceSkill = Join-Path $ScriptDir "skills\unipet"
$TargetSkills = Join-Path $HermesHome "skills"
$TargetSkill = Join-Path $TargetSkills "unipet"

if (-not (Get-Command unipet -ErrorAction SilentlyContinue)) {
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        throw "Node.js was not found. Install Node.js first, then rerun this installer."
    }
    if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
        throw "npm was not found. Install Node.js/npm first, then rerun this installer."
    }
    if (-not (Test-Path (Join-Path $OverlayDir "node_modules"))) {
        Push-Location $OverlayDir
        npm install
        Pop-Location
    }
    Push-Location $OverlayDir
    npm link
    Pop-Location
}

if (-not (Test-Path $SourceSkill)) {
    throw "Source skill not found: $SourceSkill"
}

New-Item -ItemType Directory -Force -Path $TargetSkills | Out-Null

if (Test-Path $TargetSkill) {
    Remove-Item -Recurse -Force -LiteralPath $TargetSkill
}

Copy-Item -Recurse -Force -LiteralPath $SourceSkill -Destination $TargetSkill

Write-Host "Installed UniPet Hermes skill:"
Write-Host "  $TargetSkill"

if (-not $NoLaunch) {
    unipet launch
}

unipet status
