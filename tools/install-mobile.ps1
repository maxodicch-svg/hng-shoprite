# Install the mobile app's dependencies with a full, readable log.
#
# Written for this machine, where the npm registry connection resets part-way
# through and the default npm cache directory is blocked by file permissions.
#
# Usage, from any directory:
#   powershell -ExecutionPolicy Bypass -File tools\install-mobile.ps1
#
# Every attempt appends to install-log.txt beside this script, so a failure can be
# read afterwards instead of scrolling out of the terminal.

$ErrorActionPreference = 'Continue'

$root = Split-Path -Parent $PSScriptRoot
$app = Join-Path $root 'apps\mobile'
$log = Join-Path $PSScriptRoot 'install-log.txt'
$cache = Join-Path $root '.npm-cache'
$workspaceCache = Join-Path $root '.tmp\npm-cache-mobile'

function Write-Log([string]$message) {
  $line = "[{0}] {1}" -f (Get-Date -Format 'HH:mm:ss'), $message
  Write-Host $line
  Add-Content -Path $log -Value $line -Encoding UTF8
}

Write-Log "=== mobile install starting ==="
Write-Log "app:   $app"
Write-Log "cache: workspace-local (the default npm cache is blocked on this host)"

if (-not (Test-Path $app)) {
  Write-Log "FATAL: apps\mobile not found at $app"
  exit 1
}

Set-Location $app

# 1. The legacy OpenSSL provider is what stops the ERR_SSL_CIPHER_OPERATION_FAILED
#    errors on this Node build.
$env:NODE_OPTIONS = '--openssl-legacy-provider'
Write-Log "NODE_OPTIONS=$env:NODE_OPTIONS"

# 2. Point npm's cache inside the workspace. %LocalAppData% is not writable here,
#    which surfaces as EPERM while writing cache temp files.
New-Item -ItemType Directory -Force -Path $workspaceCache | Out-Null
& npm config set cache $workspaceCache --location=project | Out-Null
Write-Log "cache set to $workspaceCache"

# 3. Clean any half-built tree, so a stale partial install cannot mask the result.
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

# 4. The flags are the documented workaround for this machine: one socket at a
#    time, many retries, no audit/fund chatter. Output is teed to the log.
$npmArgs = @(
  'install',
  '--maxsockets=1',
  '--fetch-retries=12',
  '--fetch-retry-maxtimeout=180000',
  '--no-audit',
  '--no-fund',
  '--loglevel=http'
)

& npm @npmArgs 2>&1 | Tee-Object -FilePath $log -Append

$code = $LASTEXITCODE
Write-Log ""
Write-Log "npm install exit code: $code"

# 5. Report what actually landed, rather than trusting the exit code.
$checks = [ordered]@{
  'node_modules/expo'         = (Test-Path (Join-Path $app 'node_modules\expo'))
  'node_modules/react-native' = (Test-Path (Join-Path $app 'node_modules\react-native'))
  'node_modules/expo-router'  = (Test-Path (Join-Path $app 'node_modules\expo-router'))
  'package-lock.json'         = (Test-Path (Join-Path $app 'package-lock.json'))
}

Write-Log "--- result ---"
$ready = $true
foreach ($k in $checks.Keys) {
  Write-Log ("{0,-28} {1}" -f $k, $checks[$k])
  if ($k -ne 'package-lock.json' -and -not $checks[$k]) { $ready = $false }
}

Write-Log ""
if ($ready) {
  Write-Log "READY. Next:  npx expo start --tunnel"
} else {
  Write-Log "NOT READY. Re-run this same script; npm resumes from the cache and each"
  Write-Log "attempt gets further. If it fails the same way three times, the last lines"
  Write-Log "above (and $log) are what to send on."
}
