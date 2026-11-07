#Requires -Version 7.0
<#
.SYNOPSIS
  Swap the daily DSH desktop profile's visualisation plugin from
  @nagi-ovo/dsh-visualize (upstream, HTML-only) to @dsh-unified/visualize (this repo).

.DESCRIPTION
  Run this from a normal PowerShell window (pwsh) AFTER quitting the DSH desktop
  app. It never starts or stops the app and never touches ~/.dsh/sessions or
  ~/.dsh/storages, so chat history is preserved.

  What it does:
    1. backs up package.json + pnpm-lock.yaml + an inventory into
       <profile>\.plugin-backups\<timestamp>\
    2. replaces the dependency and the dsh.profile.bundles entry in place, so
       never both `visualize` plugins are installed at once
    3. runs the desktop host's own CLI:  dsh plugin --profile desktop install
       and  dsh plugin --profile desktop peers check
    4. verifies the installed bundle hash equals the repo build (AGENTS.md §9)

.PARAMETER DryRun
  Print the planned change and exit; nothing is written.

.PARAMETER Rollback
  Restore the most recent backup and reinstall the previous plugin set.

.PARAMETER ProfileName
  Profile to change; default 'desktop' (the owner's daily profile).

.PARAMETER RepoPath
  This repository; default is the parent of tools\.

.PARAMETER AllowUnverifiedBuild
  Allow a build whose lib/client.js hash differs from the verified
  E1BF4A82… build. Off by default.
#>
[CmdletBinding()]
param(
  [switch]$DryRun,
  [switch]$Rollback,
  [string]$ProfileName = 'desktop',
  [string]$RepoPath = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
  [switch]$AllowUnverifiedBuild
)

$ErrorActionPreference = 'Stop'

$OldPlugin          = '@nagi-ovo/dsh-visualize'
$NewPlugin          = '@dsh-unified/visualize'
$VerifiedBundleHash = 'E1BF4A82B3C808899BA868009CF9DEAD15F941E6A3614040DB1E73C031456CEB'

$DshHome     = Join-Path $env:USERPROFILE '.dsh'
$ProfileDir  = Join-Path $DshHome "profiles\$ProfileName"
$PackagePath = Join-Path $ProfileDir 'package.json'
$LockPath    = Join-Path $ProfileDir 'pnpm-lock.yaml'
$DesktopCli  = Join-Path $env:LOCALAPPDATA 'Programs\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd'
$BackupRoot  = Join-Path $ProfileDir '.plugin-backups'
$SessionsDir = Join-Path $DshHome 'sessions'
$StoragesDir = Join-Path $DshHome 'storages'

function Step([string]$Text) { Write-Host "==> $Text" -ForegroundColor Cyan }
function Fail([string]$Text) {
  Write-Host ""
  Write-Host "ERROR: $Text" -ForegroundColor Red
  exit 1
}

function Get-InstalledVersion([string]$Plugin) {
  $p = Join-Path $ProfileDir "node_modules\$Plugin\package.json"
  if (Test-Path $p) { return (Get-Content $p -Raw | ConvertFrom-Json).version }
  return $null
}

function Get-InstalledBundleHash([string]$Plugin) {
  $p = Join-Path $ProfileDir "node_modules\$Plugin\lib\client.js"
  if (Test-Path $p) { return (Get-FileHash $p -Algorithm SHA256).Hash }
  return $null
}

function Get-BuildHash {
  $p = Join-Path $RepoPath 'lib\client.js'
  if (Test-Path $p) { return (Get-FileHash $p -Algorithm SHA256).Hash }
  return $null
}

function Test-AppRunning {
  $proc = Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -eq 'DeepSeek Harness' }
  if ($proc) { return $true }
  $listener = Get-NetTCPConnection -LocalPort 50270 -State Listen -ErrorAction SilentlyContinue
  return [bool]$listener
}

# This profile sets `nodeLinker: hoisted` + `autoInstallPeers: false` in
# pnpm-workspace.yaml, so pnpm deliberately does NOT install the host's peer
# packages; the host supplies them from its own asar at runtime. `peers check`
# therefore reports missing peers for every plugin in this profile, before and
# after the swap. It is recorded for diagnostics and is never a pass/fail gate;
# the runtime smoke test is the gate.
function Invoke-PeersCheck([string]$Label, [string]$Dir) {
  Step "dsh plugin --profile $ProfileName peers check  ($Label; informational only)"
  $out = & $DesktopCli plugin --profile $ProfileName peers check 2>&1 | Out-String
  $code = $LASTEXITCODE
  $missing = ([regex]::Matches($out, 'missing peer')).Count
  if ($Dir -and (Test-Path $Dir)) {
    $out | Set-Content -Path (Join-Path $Dir "peers-$Label.txt") -Encoding utf8NoBOM
  }
  Write-Host "  exit=$code, missing-peer entries=$missing (expected in this profile)"
  return [pscustomobject]@{ ExitCode = $code; Missing = $missing; Output = $out }
}

function Show-Plan($json) {
  $bundles = @($json.dsh.profile.bundles)
  $idx = [Array]::IndexOf($bundles, $OldPlugin)
  Write-Host ""
  Write-Host "Planned change:"
  Write-Host "  profile          : $ProfileDir"
  Write-Host "  dependencies     : $OldPlugin  ->  $NewPlugin = file:$($RepoPath -replace '\\','/')"
  Write-Host "  dsh.profile.bundles[$idx] : $OldPlugin  ->  $NewPlugin"
  Write-Host "  files modified   : package.json, pnpm-lock.yaml, node_modules/ (pnpm), .plugin-manager/logs/"
  Write-Host "  files NOT touched: $SessionsDir , $StoragesDir"
  Write-Host "  peer check       : informational only — this profile sets autoInstallPeers:false, so missing-host-peers is its normal state"
  Write-Host "  backup           : $BackupRoot\<timestamp>\"
  Write-Host "  bundles before   : $($bundles -join ', ')"
  Write-Host ""
}

# ---------------------------------------------------------------- preflight
if (-not (Test-Path $PackagePath)) { Fail "profile package.json not found: $PackagePath" }
if (-not (Test-Path $DesktopCli))  { Fail "desktop CLI not found: $DesktopCli" }

$appRunning = Test-AppRunning
if ($DryRun) {
  if ($appRunning) { Write-Host "note: the DSH desktop app is currently running; a real run will refuse until it is quit." -ForegroundColor Yellow }
  $json = Get-Content $PackagePath -Raw | ConvertFrom-Json
  if (-not $json.dependencies.PSObject.Properties[$OldPlugin]) { Fail "'$OldPlugin' is not in dependencies (already swapped?)." }
  if (@($json.dsh.profile.bundles) -contains $NewPlugin) { Fail "both '$OldPlugin' and '$NewPlugin' are listed; refusing." }
  Show-Plan $json
  Write-Host "DRY RUN: nothing was changed." -ForegroundColor Green
  exit 0
}

if ($appRunning) {
  Fail "the DSH desktop app is running (process 'DeepSeek Harness' / port 50270). Quit it from its own UI first, then re-run this script."
}

# ---------------------------------------------------------------- rollback
if ($Rollback) {
  if (-not (Test-Path $BackupRoot)) { Fail "no backups found at $BackupRoot" }
  $backup = Get-ChildItem $BackupRoot -Directory | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if (-not $backup) { Fail "no backup directory under $BackupRoot" }
  Step "restoring $($backup.FullName)"
  Copy-Item (Join-Path $backup.FullName 'package.json') $PackagePath -Force
  $bLock = Join-Path $backup.FullName 'pnpm-lock.yaml'
  if (Test-Path $bLock) { Copy-Item $bLock $LockPath -Force }
  Step "dsh plugin --profile $ProfileName install"
  & $DesktopCli plugin --profile $ProfileName install
  if ($LASTEXITCODE -ne 0) { Fail "pnpm install failed during rollback; the backup is still at $($backup.FullName)" }
  Invoke-PeersCheck 'rollback' $backup.FullName | Out-Null
  $oldVer = Get-InstalledVersion $OldPlugin
  $newVer = Get-InstalledVersion $NewPlugin
  if (-not $oldVer) { Fail "rollback finished but $OldPlugin is not installed; inspect $($backup.FullName)" }
  Write-Host ""
  Write-Host "ROLLBACK OK: $OldPlugin $oldVer restored; $NewPlugin installed=$([bool]$newVer)" -ForegroundColor Green
  Write-Host "Start the DSH desktop app again. Chat history was never touched." -ForegroundColor Green
  exit 0
}

# ---------------------------------------------------------------- swap
$buildHash = Get-BuildHash
if (-not $buildHash) {
  Fail "no build found at $(Join-Path $RepoPath 'lib\client.js'). In the repo run: pnpm install; pnpm run build"
}
if ($buildHash -ne $VerifiedBundleHash -and -not $AllowUnverifiedBuild) {
  Fail "build hash $buildHash differs from the verified $VerifiedBundleHash. Rebuild the verified commit, or pass -AllowUnverifiedBuild."
}

$json = Get-Content $PackagePath -Raw | ConvertFrom-Json
$deps = $json.dependencies
$bundles = @($json.dsh.profile.bundles)

if (-not $deps.PSObject.Properties[$OldPlugin]) {
  if ($deps.PSObject.Properties[$NewPlugin]) { Fail "already swapped: only $NewPlugin is listed." }
  Fail "'$OldPlugin' is not in dependencies; refusing to guess."
}
if (-not ($bundles -contains $OldPlugin)) { Fail "'$OldPlugin' is not in dsh.profile.bundles; refusing to guess." }
if ($bundles -contains $NewPlugin) { Fail "both plugins are listed; remove $OldPlugin manually first." }

$oldVersion = Get-InstalledVersion $OldPlugin
$oldHash    = Get-InstalledBundleHash $OldPlugin
$repoHead   = (& git -C $RepoPath rev-parse --short HEAD 2>$null)
if (-not $repoHead) { $repoHead = 'unknown' }
$repoStatus = (& git -C $RepoPath status --porcelain 2>$null)
$repoDirty  = [bool]$repoStatus

Show-Plan $json

# backup: package.json, lockfile, and an inventory of the state we are leaving
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backupDir = Join-Path $BackupRoot $stamp
New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
Copy-Item $PackagePath (Join-Path $backupDir 'package.json') -Force
if (Test-Path $LockPath) { Copy-Item $LockPath (Join-Path $backupDir 'pnpm-lock.yaml') -Force }
$inventory = [ordered]@{
  timestamp        = (Get-Date).ToString('o')
  profile          = $ProfileName
  repoPath         = $RepoPath
  repoHead         = $repoHead
  repoDirty        = $repoDirty
  oldPlugin        = $OldPlugin
  oldVersion       = $oldVersion
  oldBundleHash    = $oldHash
  newPlugin        = $NewPlugin
  newSource        = "file:$($RepoPath -replace '\\','/')"
  newBuildHash     = $buildHash
  dependencies     = @($deps.PSObject.Properties | ForEach-Object { @{ name = $_.Name; version = [string]$_.Value } })
  bundles          = $bundles
}
$inventory | ConvertTo-Json -Depth 8 | Set-Content (Join-Path $backupDir 'inventory.json') -Encoding utf8NoBOM
Step "backup written to $backupDir"
$peersBefore = Invoke-PeersCheck 'before' $backupDir

# transform package.json (dependency + bundle entry, in place)
$deps.PSObject.Properties.Remove($OldPlugin)
$deps | Add-Member -NotePropertyName $NewPlugin -NotePropertyValue ("file:" + ($RepoPath -replace '\\','/')) -Force
$idx = [Array]::IndexOf($bundles, $OldPlugin)
$bundles[$idx] = $NewPlugin
$json.dsh.profile.bundles = $bundles
$json | ConvertTo-Json -Depth 32 | Set-Content $PackagePath -Encoding utf8NoBOM
Step "package.json updated"

Step "dsh plugin --profile $ProfileName install"
& $DesktopCli plugin --profile $ProfileName install
if ($LASTEXITCODE -ne 0) {
  Fail "pnpm install failed. Restore with: pwsh -File `"$PSCommandPath`" -Rollback"
}
$peersAfter = Invoke-PeersCheck 'after' $backupDir
if ($peersAfter.Missing -gt $peersBefore.Missing) {
  Write-Host "warning: peer-issue count rose from $($peersBefore.Missing) to $($peersAfter.Missing); inspect peers-before.txt / peers-after.txt." -ForegroundColor Yellow
}

# verify the swap actually landed and the two plugins never coexist
$newVersion = Get-InstalledVersion $NewPlugin
$oldStill   = Get-InstalledVersion $OldPlugin
$newHash    = Get-InstalledBundleHash $NewPlugin
if (-not $newVersion)                { Fail "$NewPlugin is not installed. Restore with -Rollback." }
if ($oldStill)                       { Fail "$OldPlugin is still installed. Restore with -Rollback." }
if ($newHash -ne $buildHash)         { Fail "installed bundle hash $newHash != build $buildHash. Restore with -Rollback." }

Write-Host ""
Write-Host "SWAP OK" -ForegroundColor Green
Write-Host "  removed : $OldPlugin $oldVersion"
Write-Host "  installed: $NewPlugin $newVersion (bundle hash matches build)"
Write-Host "  backup   : $backupDir"
Write-Host ""
Write-Host "Next: start the DSH desktop app, open a conversation and run the smoke test" -ForegroundColor Green
Write-Host "  (docs/reports/STAGE-7C-DAILY-BASELINE.md §2, Step 5)." -ForegroundColor Green
Write-Host "If anything is wrong, quit the app and run:" -ForegroundColor Yellow
Write-Host "  pwsh -File `"$PSCommandPath`" -Rollback" -ForegroundColor Yellow
Write-Host "Chat/session history was never touched." -ForegroundColor Green