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

# NOTE: the build links the live ui-kit folder instead of a checkout, so
# uncommitted kit changes would ship to production unnoticed.
$KitSpec = (Get-Content (Join-Path $BuildWt "package.json") -Raw | ConvertFrom-Json).devDependencies.'@ku6epxboctuk/ui-kit'
if (-not $KitSpec -or -not $KitSpec.StartsWith("link:")) { throw "ui-kit must be a link: dependency, got '$KitSpec'" }
$KitDir = $KitSpec.Substring(5)
if (-not [System.IO.Path]::IsPathRooted($KitDir)) { $KitDir = Join-Path $BuildWt $KitDir }
if (-not (Test-Path (Join-Path $KitDir "package.json"))) { throw "ui-kit not found: $KitDir" }
$KitDirty = @(git -C $KitDir status --porcelain)
if ($LASTEXITCODE -ne 0) { throw "ui-kit is not a git checkout: $KitDir" }
if ($KitDirty.Count -gt 0) { throw "ui-kit has uncommitted changes:`n$($KitDirty -join "`n")" }

try {
	Push-Location $BuildWt
	# NOTE: the lockfile keeps link: targets relative to its own directory, so
	# the committed copy cannot validate inside the build worktree.
	pnpm install --no-frozen-lockfile
	if ($LASTEXITCODE -ne 0) { throw "pnpm install failed (exit $LASTEXITCODE)" }
	Remove-Item (Join-Path $BuildWt "build") -Recurse -Force -ErrorAction SilentlyContinue
	pnpm build
	if ($LASTEXITCODE -ne 0) { throw "pnpm build failed (exit $LASTEXITCODE)" }
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
	pnpm install --prod --no-frozen-lockfile
	if ($LASTEXITCODE -ne 0) { throw "pnpm install --prod failed (exit $LASTEXITCODE)" }
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
