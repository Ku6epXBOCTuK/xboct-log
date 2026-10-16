$ErrorActionPreference = "Stop"

$Repo     = "C:\+XBOCTuK\+life_projects\git-processes\backlog"
$AppDir   = Join-Path $env:USERPROFILE ".xboct-log\app"
$Service  = "xboct-log"
$Temp     = Join-Path $env:TEMP ("xboct-log-build-" + [guid]::NewGuid().ToString("N"))
$StartDir = (Get-Location).Path

Get-ChildItem $env:TEMP -Directory -Filter "xboct-log-build-*" -ErrorAction SilentlyContinue | ForEach-Object {
	try { Remove-Item $_.FullName -Recurse -Force -ErrorAction Stop }
	catch { Write-Warning "stale build dir kept: $($_.Name)" }
}

git -C $Repo fetch origin
git -C $Repo worktree add --detach $Temp origin/main
try {
	Push-Location $Temp
	pnpm install --frozen-lockfile
	pnpm build
	Pop-Location

	$builtIndex = Join-Path $Temp "build\index.js"
	if (-not (Test-Path $builtIndex)) { throw "build output missing: $builtIndex" }

	New-Item -ItemType Directory -Force $AppDir | Out-Null
	New-Item -ItemType Directory -Force (Join-Path $AppDir "logs") | Out-Null
	Copy-Item (Join-Path $Temp "package.json"), (Join-Path $Temp "pnpm-lock.yaml") $AppDir -Force
	Copy-Item (Join-Path $Repo "scripts\start-prod.mjs") (Join-Path $AppDir "start.mjs") -Force

	Push-Location $AppDir
	pnpm install --prod --frozen-lockfile
	Pop-Location

	if ((nssm status $Service).Trim() -eq "SERVICE_RUNNING") { nssm stop $Service | Out-Null }

	$null = robocopy (Join-Path $Temp "build") (Join-Path $AppDir "build") /MIR /NFL /NDL /NJH /NJS
	if ($LASTEXITCODE -ge 8) { throw "robocopy failed (exit $LASTEXITCODE)" }

	$head = git -C $Temp rev-parse HEAD
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
	$ErrorActionPreference = "Continue"
	git -C $Repo worktree remove $Temp --force 2>$null
	git -C $Repo worktree prune 2>$null
	for ($i = 0; $i -lt 3 -and (Test-Path $Temp); $i++) {
		Start-Sleep -Seconds 2
		Remove-Item $Temp -Recurse -Force -ErrorAction SilentlyContinue
	}
	if (Test-Path $Temp) { Write-Warning "leftover build dir not removed (locked native module): $Temp" }
}
