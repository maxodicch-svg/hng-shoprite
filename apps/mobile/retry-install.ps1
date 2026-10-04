# Retry the mobile install until it succeeds — built for a slow 3G connection.
#
# On a slow link a single `npm install` will almost certainly die part-way. That
# is fine: npm's cache is resumable, so each attempt picks up where the last one
# stopped instead of starting over. This script automates the "run it again"
# part and stops as soon as the tree is actually complete.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File retry-mobile-install.ps1
#   powershell -ExecutionPolicy Bypass -File retry-mobile-install.ps1 -MaxAttempts 20
#
# Leave it running. On 3G expect several attempts over a long stretch; most of
# the package data is already in the cache from earlier attempts.

param(
  [int]$MaxAttempts = 15,
  [int]$PauseSeconds = 15
)

$ErrorActionPreference = 'Continue'

# --- locate things ----------------------------------------------------------
$scriptDir = $PSScriptRoot
if ((Split-Path -Leaf $scriptDir) -eq 'mobile') {
  $app = $scriptDir
  $repoRoot = Split-Path -Parent (Split-Path -Parent $scriptDir)
} else {
  $repoRoot = Split-Path -Parent $scriptDir
  $app = Join-Path $repoRoot 'apps\mobile'
}
$cache = Join-Path $repoRoot '.tmp\npm-cache-mobile'
$log = Join-Path $scriptDir 'resume-install-log.txt'

function Write-Log([string]$message) {
  $line = "[{0}] {1}" -f (Get-Date -Format 'HH:mm:ss'), $message
  Write-Host $line
  Add-Content -Path $log -Value $line -Encoding UTF8
}

if (-not (Test-Path $app)) {
  Write-Host "FATAL: could not find apps\mobile (looked in $app)"
  exit 1
}

Set-Location $app
New-Item -ItemType Directory -Force -Path $cache | Out-Null

# --- environment ------------------------------------------------------------
# Do NOT set --openssl-legacy-provider: it was an early suspect and is not needed.
Remove-Item Env:\NODE_OPTIONS -ErrorAction SilentlyContinue
# npm_config_cache is set at user scope and an env var outranks .npmrc, so the
# cache is also passed as a CLI flag (which outranks everything).
$env:npm_config_cache = $cache

Write-Log "================================================================"
Write-Log "app:         $app"
Write-Log "cache:       $cache"
Write-Log "maxAttempts: $MaxAttempts"
Write-Log "node $(node --version) / npm $(npm --version)"

$npmArgs = @(
  'install',
  "--cache=$cache",
  '--prefer-offline',
  '--legacy-peer-deps',
  '--maxsockets=1',
  '--fetch-retries=12',
  '--fetch-timeout=600000',
  '--no-audit',
  '--no-fund'
)

function Test-Complete {
  return (Test-Path (Join-Path $app 'node_modules\expo')) -and
         (Test-Path (Join-Path $app 'node_modules\react-native')) -and
         (Test-Path (Join-Path $app 'node_modules\expo-router'))
}

$attempt = 0
while ($attempt -lt $MaxAttempts) {
  $attempt++
  Write-Log ""
  Write-Log "--- attempt $attempt of $MaxAttempts ---"

  # Progress marker: how much is already banked in the cache.
  $cached = (Get-ChildItem (Join-Path $cache '_cacache\content-v2') -Recurse -File -ErrorAction SilentlyContinue | Measure-Object).Count
  Write-Log "cached packages so far: $cached"

  & npm @npmArgs 2>&1 | Select-Object -Last 12 | ForEach-Object { Write-Host $_ }
  Write-Log "npm exit code: $LASTEXITCODE"

  if (Test-Complete) {
    Write-Log ""
    Write-Log "SUCCESS - the dependency tree is complete."
    Write-Log "Next:  cd $app"
    Write-Log "       npx expo start"
    exit 0
  }

  # Partial progress is normal and useful; only a hard failure with no change is
  # worth stopping for. Report the shortfall either way.
  $missing = @()
  foreach ($pkg in @('expo', 'react-native', 'expo-router')) {
    if (-not (Test-Path (Join-Path $app "node_modules\$pkg"))) { $missing += $pkg }
  }
  Write-Log "still missing: $($missing -join ', ')"
  Write-Log "cached packages now: $((Get-ChildItem (Join-Path $cache '_cacache\content-v2') -Recurse -File -ErrorAction SilentlyContinue | Measure-Object).Count)"

  if ($attempt -lt $MaxAttempts) {
    Write-Log "waiting $PauseSeconds s before the next attempt (cache makes each one shorter)"
    Start-Sleep -Seconds $PauseSeconds
  }
}

Write-Log ""
Write-Log "GAVE UP after $MaxAttempts attempts."
Write-Log "The cache holds what was downloaded; re-running this script resumes from there."
Write-Log "Nothing was lost - node_modules simply is not complete yet."
exit 1
