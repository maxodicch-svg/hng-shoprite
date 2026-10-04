# Install the mobile app's dependencies with a full, readable log.
#
# Written for this machine, where npm install failed with
#   ERR_SSL_CIPHER_OPERATION_FAILED  (ossl_gcm_stream_update: cipher operation failed)
# even though `npm ping` to the same registry succeeds. The handoff notes claimed
# --openssl-legacy-provider fixes the SSL errors, but that flag is now suspected of
# *causing* them on Node 24, so it is opt-in here rather than always-on.
#
# Usage (from the repository root, or anywhere — the paths are resolved from this
# script's own location):
#
#   powershell -ExecutionPolicy Bypass -File tools\install-mobile.ps1
#   powershell -ExecutionPolicy Bypass -File tools\install-mobile.ps1 -LegacyProvider
#   powershell -ExecutionPolicy Bypass -File tools\install-mobile.ps1 -KeepCache
#
# Every run appends to tools\install-log.txt, so a failure can be read afterwards
# instead of scrolling out of the terminal.

param(
  # Force Node's legacy OpenSSL provider. Off by default: the flag is the first
  # suspect for the cipher failure, so the default run deliberately omits it.
  [switch]$LegacyProvider,
  # Keep the npm cache. By default the cache is cleared, because a cache written
  # through TLS-inspection failures can itself be the source of integrity errors.
  [switch]$KeepCache
)

$ErrorActionPreference = 'Continue'

# Resolve the repository root from wherever this script happens to live, so the
# same file works from tools\ and from a convenience copy inside apps\mobile\
# (which is where the terminal usually already is).
$scriptDir = $PSScriptRoot
if ((Split-Path -Leaf $scriptDir) -eq 'mobile') {
  $app = $scriptDir
  $repoRoot = Split-Path -Parent (Split-Path -Parent $scriptDir)
} else {
  $repoRoot = Split-Path -Parent $scriptDir
  $app = Join-Path $repoRoot 'apps\mobile'
}
$log = Join-Path $scriptDir 'install-log.txt'

function Write-Log([string]$message) {
  $line = "[{0}] {1}" -f (Get-Date -Format 'HH:mm:ss'), $message
  Write-Host $line
  Add-Content -Path $log -Value $line -Encoding UTF8
}

Write-Log "================================================================"
Write-Log "=== mobile install starting ==="
Write-Log "app:           $app"
Write-Log "legacyProvider: $($LegacyProvider.IsPresent)"
Write-Log "keepCache:     $($KeepCache.IsPresent)"

if (-not (Test-Path $app)) {
  Write-Log "FATAL: apps\mobile not found at $app"
  exit 1
}

Set-Location $app

# --- environment ------------------------------------------------------------
if ($LegacyProvider) {
  $env:NODE_OPTIONS = '--openssl-legacy-provider'
  Write-Log "NODE_OPTIONS=$env:NODE_OPTIONS"
} else {
  Remove-Item Env:\NODE_OPTIONS -ErrorAction SilentlyContinue
  Write-Log "NODE_OPTIONS cleared (default)"
}

# --- cache ------------------------------------------------------------------
# THE ROOT CAUSE OF EVERY FAILED INSTALL ON THIS HOST.
#
# %LocalAppData%\npm-cache is not writable here, so npm aborts with
#   EPERM: operation not permitted, open '...\npm-cache\_cacache\tmp\***'
# Worse, npm_config_cache is set at USER scope, and an "env" config outranks both
# the built-in and project .npmrc — so setting cache in a project .npmrc has no
# effect whatsoever. It must be written to the user config, and the inherited
# environment variable cleared for this process.
$cache = Join-Path $repoRoot '.tmp\npm-cache-mobile'
New-Item -ItemType Directory -Force -Path $cache | Out-Null

$env:npm_config_cache = $cache
& npm config set cache $cache --location=user | Out-Null

$resolved = (& npm config get cache) -join ''
Write-Log "cache set to $cache (user scope)"
Write-Log "npm resolves cache as: $resolved"
if ($resolved.Trim() -ne $cache) {
  Write-Log "WARNING: npm is not using the intended cache — installs will likely fail with EPERM."
}

if (-not $KeepCache -and (Test-Path $cache)) {
  Write-Log "clearing the cache (pass -KeepCache to keep it)"
  Get-ChildItem $cache -Force | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
}

# --- clean slate ------------------------------------------------------------
foreach ($target in @('node_modules', 'package-lock.json')) {
  $path = Join-Path $app $target
  if (Test-Path $path) {
    Write-Log "removing $target"
    Remove-Item -Recurse -Force $path -ErrorAction SilentlyContinue
  }
}

Write-Log "node: $(node --version)   npm: $(npm --version)"
Write-Log ""
Write-Log "--- npm install (this can take many minutes) ---"
Write-Log ""

# --- install ----------------------------------------------------------------
# --cache is passed explicitly on the command line, not just configured. This
# environment already carries npm_config_cache at USER scope (set by the npx
# invocation that launched the tooling), and an "env" config outranks the
# built-in and project .npmrc — so a config-file setting alone is silently
# ignored and npm falls back to the unwritable %LocalAppData% cache. A CLI flag
# outranks every config source, which is why it is used here.
#
# --maxsockets=1 and the retry flags follow the documented workaround for this
# host's unstable connection.
$npmArgs = @(
  'install',
  "--cache=$cache",
  '--maxsockets=1',
  '--fetch-retries=12',
  '--fetch-retry-maxtimeout=300000',
  '--fetch-timeout=600000',
  '--no-audit',
  '--no-fund',
  '--loglevel=http'
)

& npm @npmArgs 2>&1 | Tee-Object -FilePath $log -Append
$code = $LASTEXITCODE

Write-Log ""
Write-Log "npm install exit code: $code"

# --- verify what actually landed -------------------------------------------
$checks = [ordered]@{
  'node_modules/expo'         = (Test-Path (Join-Path $app 'node_modules\expo'))
  'node_modules/react-native' = (Test-Path (Join-Path $app 'node_modules\react-native'))
  'node_modules/expo-router'  = (Test-Path (Join-Path $app 'node_modules\expo-router'))
  'package-lock.json'         = (Test-Path (Join-Path $app 'package-lock.json'))
}

Write-Log "--- result ---"
$ready = $true
foreach ($key in $checks.Keys) {
  Write-Log ("{0,-28} {1}" -f $key, $checks[$key])
  if ($key -ne 'package-lock.json' -and -not $checks[$key]) { $ready = $false }
}

Write-Log ""
if ($ready) {
  Write-Log "READY. Next:"
  Write-Log "  cd apps\mobile"
  Write-Log "  npx expo start"
} else {
  Write-Log "NOT READY."
  Write-Log ""
  Write-Log "If the log shows ERR_SSL_CIPHER_OPERATION_FAILED, try the opposite"
  Write-Log "environment to this run, i.e.:"
  if ($LegacyProvider) {
    Write-Log "  powershell -ExecutionPolicy Bypass -File tools\install-mobile.ps1"
  } else {
    Write-Log "  powershell -ExecutionPolicy Bypass -File tools\install-mobile.ps1 -LegacyProvider"
  }
  Write-Log ""
  Write-Log "Send the last 25 lines of $log."
}
