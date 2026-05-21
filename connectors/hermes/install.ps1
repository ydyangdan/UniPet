param(
    [string]$HermesHome = "",
    [switch]$NoStart
)

$ErrorActionPreference = "Stop"

function Resolve-HermesHomeFromPowerShellScript {
    param([string]$Path)

    if (-not $Path -or -not (Test-Path $Path)) {
        return $null
    }

    foreach ($line in Get-Content -LiteralPath $Path) {
        if ($line -match '\$env:HERMES_HOME\s*=\s*["'']([^"'']+)["'']') {
            return $matches[1]
        }
    }
    return $null
}

function Resolve-HermesHomeFromCommand {
    $cmd = Get-Command hermes -ErrorAction SilentlyContinue
    if (-not $cmd -or -not $cmd.Source -or -not (Test-Path $cmd.Source)) {
        return $null
    }

    $source = $cmd.Source
    if ($source.EndsWith(".ps1", [System.StringComparison]::OrdinalIgnoreCase)) {
        return Resolve-HermesHomeFromPowerShellScript -Path $source
    }

    if ($source.EndsWith(".cmd", [System.StringComparison]::OrdinalIgnoreCase) -or
        $source.EndsWith(".bat", [System.StringComparison]::OrdinalIgnoreCase)) {
        foreach ($line in Get-Content -LiteralPath $source) {
            if ($line -match 'set\s+HERMES_HOME=([^\r\n]+)') {
                return $matches[1].Trim().Trim('"')
            }
            if ($line -match '-File\s+["'']([^"'']+\.ps1)["'']') {
                $scriptHome = Resolve-HermesHomeFromPowerShellScript -Path $matches[1]
                if ($scriptHome) {
                    return $scriptHome
                }
            }
        }
    }

    return $null
}

if (-not $HermesHome -or $HermesHome.Trim().Length -eq 0) {
    $HermesHome = Resolve-HermesHomeFromCommand
}
if (-not $HermesHome -or $HermesHome.Trim().Length -eq 0) {
    $HermesHome = $env:HERMES_HOME
}
if (-not $HermesHome -or $HermesHome.Trim().Length -eq 0) {
    $HermesHome = Join-Path $HOME ".hermes"
}

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Resolve-Path (Join-Path $ScriptDir "..\..")
$OverlayDir = Join-Path $ProjectRoot "overlay"
$SourceSkill = Join-Path $ScriptDir "skills\unipet"
$SourcePlugin = Join-Path $ScriptDir "plugins\unipet"
$TargetSkills = Join-Path $HermesHome "skills"
$TargetSkill = Join-Path $TargetSkills "unipet"
$TargetPlugins = Join-Path $HermesHome "plugins"
$TargetPlugin = Join-Path $TargetPlugins "unipet"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw "Node.js was not found. Install Node.js first, then rerun this installer."
}
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    throw "npm was not found. Install Node.js/npm first, then rerun this installer."
}

$NpmPrefix = (& npm prefix -g).Trim()
$NpmUnipet = Join-Path $NpmPrefix "unipet.cmd"
$ResolvedUnipet = Get-Command unipet -ErrorAction SilentlyContinue
$UnipetCommand = "unipet"

if (-not $ResolvedUnipet) {
    if (-not (Test-Path (Join-Path $OverlayDir "node_modules"))) {
        Push-Location $OverlayDir
        npm install
        Pop-Location
    }
    Push-Location $OverlayDir
    npm link
    Pop-Location
    $ResolvedUnipet = Get-Command unipet -ErrorAction SilentlyContinue
}

if ($ResolvedUnipet -and $ResolvedUnipet.Source -and -not $ResolvedUnipet.Source.StartsWith($NpmPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
    Write-Warning "Another unipet command is first on PATH: $($ResolvedUnipet.Source)"
    Write-Warning "Using npm-linked UniPet for this installer: $NpmUnipet"
    $UnipetCommand = $NpmUnipet
}

if (-not (Test-Path $SourceSkill)) {
    throw "Source skill not found: $SourceSkill"
}
if (-not (Test-Path $SourcePlugin)) {
    throw "Source plugin not found: $SourcePlugin"
}

New-Item -ItemType Directory -Force -Path $TargetSkills | Out-Null
New-Item -ItemType Directory -Force -Path $TargetPlugins | Out-Null

if (Test-Path $TargetSkill) {
    Remove-Item -Recurse -Force -LiteralPath $TargetSkill
}
if (Test-Path $TargetPlugin) {
    Remove-Item -Recurse -Force -LiteralPath $TargetPlugin
}

Copy-Item -Recurse -Force -LiteralPath $SourceSkill -Destination $TargetSkill
Copy-Item -Recurse -Force -LiteralPath $SourcePlugin -Destination $TargetPlugin

Write-Host "Installed UniPet agent skill for Hermes:"
Write-Host "  $TargetSkill"
Write-Host "Installed UniPet Hermes plugin:"
Write-Host "  $TargetPlugin"

$HermesCommand = Get-Command hermes -ErrorAction SilentlyContinue
if ($HermesCommand) {
    $PreviousHermesHome = $env:HERMES_HOME
    try {
        $env:HERMES_HOME = $HermesHome
        & $HermesCommand.Source plugins enable unipet
        if ($LASTEXITCODE -ne 0) {
            Write-Warning "Could not auto-enable Hermes plugin 'unipet'. Run 'hermes plugins enable unipet' manually."
        }
    } catch {
        Write-Warning "Could not auto-enable Hermes plugin 'unipet'. Run 'hermes plugins enable unipet' manually."
    } finally {
        $env:HERMES_HOME = $PreviousHermesHome
    }
} else {
    Write-Warning "Hermes command not found. Plugin was copied but not auto-enabled."
}

if (-not $NoStart) {
    & $UnipetCommand start
}

& $UnipetCommand status
