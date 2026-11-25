param(
  [Parameter(Mandatory)]
  [string]$Exe
)

$ErrorActionPreference = 'Stop'
$exePath = (Resolve-Path -LiteralPath $Exe).Path
$profilePath = Join-Path ([IO.Path]::GetTempPath()) ('byazen-smoke-' + [guid]::NewGuid())
$null = New-Item -ItemType Directory -Path $profilePath
$env:BYAZEN_SMOKE_DIR = $profilePath

try {
  $process = Start-Process -FilePath $exePath -WorkingDirectory (Split-Path $exePath) -ArgumentList '--byazen-smoke-test' -PassThru
  if (-not $process.WaitForExit(120000)) {
    taskkill.exe /PID $process.Id /T /F
    throw "Startup timed out: $exePath"
  }
  $reportPath = Join-Path $profilePath 'startup.txt'
  if (-not (Test-Path -LiteralPath $reportPath)) {
    throw "The app never reported startup (exit code: $($process.ExitCode)): $exePath"
  }
  $report = Get-Content -Raw -LiteralPath $reportPath
  if ($process.ExitCode -ne 0 -or $report -ne 'OK') {
    throw "Startup failed (exit code: $($process.ExitCode)): $report"
  }
  Write-Host "Verified startup, visible window and all 185 catalog cards: $exePath"
} finally {
  Remove-Item Env:BYAZEN_SMOKE_DIR
  Remove-Item -LiteralPath $profilePath -Recurse -Force -ErrorAction SilentlyContinue
}
