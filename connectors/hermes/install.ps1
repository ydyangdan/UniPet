param(
    [string]$HermesHome = $env:HERMES_HOME,
    [switch]$NoLaunch
)

$ErrorActionPreference = "Stop"

if (-not $HermesHome -or $HermesHome.Trim().Length -eq 0) {
    $HermesHome = Join-Path $HOME ".hermes"
}

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$SourceSkill = Join-Path $ScriptDir "skills\unipet"
$TargetSkills = Join-Path $HermesHome "skills"
$TargetSkill = Join-Path $TargetSkills "unipet"

if (-not (Get-Command unipet -ErrorAction SilentlyContinue)) {
    throw "The 'unipet' command was not found. Run 'python -m pip install -e .' from the UniPet project root first."
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
