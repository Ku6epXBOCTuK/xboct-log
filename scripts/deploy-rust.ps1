param(
	[string]$Service = "xboct-log",
	[string]$AppDir = (Join-Path $env:USERPROFILE ".xboct-log\app-rust"),
	[string]$ServiceDir = (Join-Path $env:USERPROFILE ".xboct-log\app"),
	[string]$DataDir = (Join-Path $env:USERPROFILE ".xboct-log"),
	[int]$Port = 45881,
	[string]$HostName = "0.0.0.0",
	[switch]$SkipBuild,
	[switch]$SkipBackup,
	[switch]$AllowStaleBuild,
	[switch]$DryRun
)

$ErrorActionPreference = "Stop"

$Repo = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$Health = "http://127.0.0.1:$Port/api/health"
$Launcher = Join-Path $PSScriptRoot "launcher.mjs"
$StartFile = Join-Path $ServiceDir "start.mjs"
$NodeApp = Join-Path $ServiceDir "node-app.mjs"
$RuntimeFile = Join-Path $ServiceDir "runtime.json"

function Read-Status {
	return (nssm status $Service).Trim()
}

function Wait-Status([string]$Expected, [int]$Seconds = 30) {
	$deadline = (Get-Date).AddSeconds($Seconds)
	while ((Get-Date) -lt $deadline) {
		if ((Read-Status) -eq $Expected) { return $true }
		Start-Sleep -Milliseconds 500
	}
	return $false
}

function Wait-Health([int]$Seconds = 40) {
	$deadline = (Get-Date).AddSeconds($Seconds)
	while ((Get-Date) -lt $deadline) {
		try {
			$answer = Invoke-RestMethod -Uri $Health -TimeoutSec 3
			if ($answer.ok -eq $true) { return $answer }
		}
		catch {
			# NOTE: the service needs a moment after nssm reports it running.
		}
		Start-Sleep -Milliseconds 500
	}
	return $null
}

function Stop-App {
	if ((Read-Status) -ne "SERVICE_STOPPED") {
		nssm stop $Service | Out-Null
		if (-not (Wait-Status "SERVICE_STOPPED")) { throw "service '$Service' did not stop" }
	}
}

function Start-App {
	nssm start $Service | Out-Null
}

function Restart-App {
	Stop-App
	Start-App
}

# NOTE: nssm reports stopped while the old process still holds its image file
function Copy-Binary([string]$Source, [string]$Target) {
	$deadline = (Get-Date).AddSeconds(15)
	while ($true) {
		try {
			Copy-Item $Source $Target -Force
			return
		}
		catch {
			if ((Get-Date) -ge $deadline) { throw }
			Start-Sleep -Milliseconds 500
		}
	}
}

function Write-Runtime([string]$Mode) {
	if ($Mode -eq "rust") {
		$runtime = [ordered]@{
			mode    = "rust"
			command = (Join-Path $AppDir "xboct-log.exe")
			cwd     = $AppDir
			args    = @(
				"--data", $DataDir,
				"--web", (Join-Path $AppDir "web"),
				"--port", "$Port",
				"--host", $HostName,
				"--no-open"
			)
		}
	}
	else {
		$runtime = [ordered]@{ mode = "node" }
	}
	[IO.File]::WriteAllText($RuntimeFile, ($runtime | ConvertTo-Json -Depth 4))
}

function Install-Launcher {
	if (-not (Test-Path $Launcher)) { throw "the launcher template is missing: $Launcher" }
	New-Item -ItemType Directory -Force $ServiceDir | Out-Null
	$current = if (Test-Path $StartFile) { Get-Content $StartFile -Raw } else { "" }
	$isLauncher = $current.Contains("runtime.json")
	if (-not $isLauncher -and -not (Test-Path $NodeApp)) {
		if (-not (Test-Path $StartFile)) { throw "the node launcher is missing: $StartFile" }
		Copy-Item $StartFile $NodeApp -Force
	}
	if (-not (Test-Path $NodeApp)) {
		throw "the node app entry is missing: $NodeApp"
	}
	Copy-Item $Launcher $StartFile -Force
}

if (-not (Get-Command nssm -ErrorAction SilentlyContinue)) { throw "nssm is not on PATH" }
if ((Read-Status) -eq "") { throw "service '$Service' does not exist" }
if ($DryRun) { Write-Host "dry run: the service will not be touched" }

if (-not $SkipBackup -and -not $DryRun) {
	try {
		$backup = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/backup" -Method Post `
			-ContentType "application/json" -Body "{}" -TimeoutSec 30
	}
	catch {
		throw "the database backup failed: $($_.Exception.Message); rerun with -SkipBackup to deploy without it"
	}
	if ($backup.ok -ne $true) {
		throw "the database backup failed: $($backup.error); rerun with -SkipBackup to deploy without it"
	}
	Write-Host "database backup: $($backup.path)"
}

if (-not $SkipBuild) {
	Push-Location $Repo
	try {
		Write-Host "building the spa"
		$env:XBOCT_LOG_STATIC = "1"
		pnpm build
		if ($LASTEXITCODE -ne 0) { throw "pnpm build failed (exit $LASTEXITCODE)" }

		Write-Host "building the rust binary"
		cargo build --release --locked -p xboct-log-cli
		if ($LASTEXITCODE -ne 0) { throw "cargo build failed (exit $LASTEXITCODE)" }
	}
	finally {
		Remove-Item Env:\XBOCT_LOG_STATIC -ErrorAction SilentlyContinue
		Pop-Location
	}
}

$targetDir = (cargo metadata --format-version 1 --no-deps | ConvertFrom-Json).target_directory
$binary = Join-Path $targetDir "release\xboct-log.exe"
if (-not (Test-Path $binary)) { throw "the rust binary is missing: $binary" }

$web = Join-Path $Repo "build"
if (-not (Test-Path (Join-Path $web "index.html"))) {
	throw "build\index.html is missing; run pnpm build with XBOCT_LOG_STATIC=1"
}

if (-not $AllowStaleBuild) {
	$index = Get-Item (Join-Path $web "index.html")
	$newest = @(
		Get-ChildItem (Join-Path $Repo "src") -Recurse -File
		if (Test-Path (Join-Path $Repo "static")) { Get-ChildItem (Join-Path $Repo "static") -Recurse -File }
		Get-Item (Join-Path $Repo "vite.config.ts"), (Join-Path $Repo "package.json")
	) | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1
	if ($null -ne $newest -and $newest.LastWriteTimeUtc -gt $index.LastWriteTimeUtc) {
		throw "build\index.html is older than $($newest.FullName); rebuild with XBOCT_LOG_STATIC=1 pnpm build or pass -AllowStaleBuild"
	}
}

New-Item -ItemType Directory -Force $AppDir, (Join-Path $AppDir "logs"), (Join-Path $AppDir "web") | Out-Null

if (-not $DryRun) {
	Write-Host "stopping the service to replace the binary"
	Stop-App
}
try {
	Copy-Binary $binary (Join-Path $AppDir "xboct-log.exe")
	$null = robocopy $web (Join-Path $AppDir "web") /MIR /NFL /NDL /NJH /NJS
	if ($LASTEXITCODE -ge 8) { throw "robocopy failed (exit $LASTEXITCODE)" }

	$head = (git -C $Repo rev-parse HEAD).Trim()
	"$head  $(Get-Date -Format o)" | Set-Content (Join-Path $AppDir "version.txt")
}
catch {
	if (-not $DryRun) { Start-App }
	throw
}

if ($DryRun) {
	Write-Host "would install the launcher: $Launcher -> $StartFile"
	Write-Host "would keep the node app: $NodeApp"
	Write-Host "would set runtime.json mode: rust"
	Write-Host "would start: $(Join-Path $AppDir 'xboct-log.exe') --data $DataDir --web $(Join-Path $AppDir 'web') --port $Port --host $HostName --no-open"
	return
}

Install-Launcher
Write-Runtime "rust"

Write-Host "switching the service to rust"
Restart-App

$answer = Wait-Health
if ($null -eq $answer) {
	Write-Warning "the rust version did not become healthy, returning to node"
	Write-Runtime "node"
	Restart-App
	if ($null -eq (Wait-Health)) { throw "neither rust nor node answered $Health" }
	throw "deployment failed and the node version was restored"
}

Write-Host "deployed $head to $AppDir"
Write-Host "service status: $(Read-Status)"
Write-Host "health: $($answer | ConvertTo-Json -Compress)"
