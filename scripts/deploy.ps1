$ErrorActionPreference = "Stop"

$Repo     = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$BuildWt  = Join-Path $env:LOCALAPPDATA "xboct-log\build-wt"
$AppDir   = Join-Path $env:USERPROFILE ".xboct-log\app"
$Service  = "xboct-log"
$StartDir = (Get-Location).Path

# NOTE: the build worktree and the application folder are the only hardcoded
# paths in the repository. The build worktree carries the deployment
# configuration.
$EnvFile = Join-Path $BuildWt ".env"
if (-not (Test-Path $EnvFile)) { throw "missing $EnvFile" }

git -C $Repo fetch origin

$ready = $false
if (Test-Path (Join-Path $BuildWt ".git")) {
	git -C $BuildWt reset --hard origin/main 2>$null
	$ready = $LASTEXITCODE -eq 0
}
if (-not $ready) {
	git -C $Repo worktree prune 2>$null
	if (Test-Path $BuildWt) { Remove-Item $BuildWt -Recurse -Force -ErrorAction SilentlyContinue }
	New-Item -ItemType Directory -Force (Split-Path $BuildWt -Parent) | Out-Null
	git -C $Repo worktree add --detach $BuildWt origin/main
}

try {
	Push-Location $BuildWt
	pnpm install --frozen-lockfile
	pnpm build
	Pop-Location

	$builtIndex = Join-Path $BuildWt "build\index.js"
	if (-not (Test-Path $builtIndex)) { throw "build output missing: $builtIndex" }

	New-Item -ItemType Directory -Force $AppDir | Out-Null
	New-Item -ItemType Directory -Force (Join-Path $AppDir "logs") | Out-Null
	Copy-Item (Join-Path $BuildWt "package.json"), (Join-Path $BuildWt "pnpm-lock.yaml"), (Join-Path $BuildWt "pnpm-workspace.yaml") $AppDir -Force
	Copy-Item (Join-Path $BuildWt "scripts\start-prod.mjs") (Join-Path $AppDir "start.mjs") -Force
	Copy-Item (Join-Path $Repo "scripts\restore.mjs") (Join-Path $AppDir "restore.mjs") -Force
	Copy-Item $EnvFile (Join-Path $AppDir ".env") -Force

	Push-Location $AppDir
	pnpm install --prod --frozen-lockfile
	Pop-Location

	$null = robocopy (Join-Path $BuildWt "migrations") (Join-Path $AppDir "migrations") /MIR /NFL /NDL /NJH /NJS
	if ($LASTEXITCODE -ge 8) { throw "robocopy migrations failed (exit $LASTEXITCODE)" }

	if ((nssm status $Service).Trim() -ne "SERVICE_STOPPED") { nssm stop $Service | Out-Null }

	$null = robocopy (Join-Path $BuildWt "build") (Join-Path $AppDir "build") /MIR /NFL /NDL /NJH /NJS
	if ($LASTEXITCODE -ge 8) { throw "robocopy failed (exit $LASTEXITCODE)" }

	$head = git -C $BuildWt rev-parse HEAD
	"$head  $(Get-Date -Format o)" | Set-Content (Join-Path $AppDir "version.txt")

	nssm start $Service | Out-Null
	Write-Host "deployed $head -> $AppDir"
	for ($i = 0; $i -lt 10; $i++) {
		Start-Sleep -Milliseconds 500
		if ((nssm status $Service).Trim() -eq "SERVICE_RUNNING") { break }
	}
	Write-Host "service status: $((nssm status $Service).Trim())"
}
finally {
	Set-Location $StartDir
}
