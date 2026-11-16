param(
	[Parameter(Position = 0)][string]$Instance = "",
	[string]$Config = "",
	[string]$Service = "",
	[string]$AppDir = "",
	[int]$Port = 0,
	[switch]$SkipBuild,
	[switch]$SkipBackup,
	[switch]$AllowStaleBuild,
	[switch]$DryRun
)

$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "instance-config.ps1")
. (Join-Path $PSScriptRoot "nssm-service.ps1")

if (-not (Get-Command nssm -ErrorAction SilentlyContinue)) { throw "nssm is not on PATH" }

$cfg = Read-InstanceConfig -Instance $Instance -Config $Config
$Service = Resolve-ServiceName (Get-InstanceValue $cfg "SERVICE" $Service)

$application = Get-ServiceValue $Service "Application"
if ((Split-Path $application -Leaf) -ne "xboct-log.exe") {
	throw "service '$Service' runs '$application'; it must run xboct-log.exe directly before this script can deploy"
}

$serviceAppDir = Split-Path $application -Parent
if ($AppDir -and ([IO.Path]::GetFullPath($AppDir).TrimEnd('\') -ne $serviceAppDir.TrimEnd('\'))) {
	throw "the service runs $(Join-Path $serviceAppDir 'xboct-log.exe'), not $AppDir"
}
$AppDir = $serviceAppDir

$servicePort = 0
$parameters = (Get-ServiceValue $Service "AppParameters") -split '\s+'
for ($i = 0; $i -lt $parameters.Count - 1; $i++) {
	if ($parameters[$i] -eq "--port") { $servicePort = [int]$parameters[$i + 1] }
}
if ($servicePort -le 0) {
	throw "service '$Service' has no --port in its arguments; it must run xboct-log.exe directly before this script can deploy"
}
if ($Port -gt 0 -and $Port -ne $servicePort) {
	throw "the service listens on $servicePort, not $Port"
}
$Port = $servicePort

$Repo = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

function Read-Status {
	return (Invoke-Nssm @("status", $Service)).Text
}

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
		pnpm build
		if ($LASTEXITCODE -ne 0) { throw "pnpm build failed (exit $LASTEXITCODE)" }

		Write-Host "building the rust binary"
		cargo build --release --locked -p xboct-log-cli
		if ($LASTEXITCODE -ne 0) { throw "cargo build failed (exit $LASTEXITCODE)" }
	}
	finally {
		Pop-Location
	}
}

$targetDir = (cargo metadata --format-version 1 --no-deps | ConvertFrom-Json).target_directory
$binary = Join-Path $targetDir "release\xboct-log.exe"
if (-not (Test-Path $binary)) { throw "the rust binary is missing: $binary" }

$web = Join-Path $Repo "build"
if (-not (Test-Path (Join-Path $web "index.html"))) {
	throw "build\index.html is missing; run pnpm build"
}

if (-not $AllowStaleBuild) {
	$index = Get-Item (Join-Path $web "index.html")
	$newest = @(
		Get-ChildItem (Join-Path $Repo "src") -Recurse -File
		if (Test-Path (Join-Path $Repo "static")) { Get-ChildItem (Join-Path $Repo "static") -Recurse -File }
		Get-Item (Join-Path $Repo "vite.config.ts"), (Join-Path $Repo "package.json")
	) | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1
	if ($null -ne $newest -and $newest.LastWriteTimeUtc -gt $index.LastWriteTimeUtc) {
		throw "build\index.html is older than $($newest.FullName); rebuild with pnpm build or pass -AllowStaleBuild"
	}
}

New-Item -ItemType Directory -Force $AppDir, (Join-Path $AppDir "logs"), (Join-Path $AppDir "web") | Out-Null

if ($DryRun) {
	Write-Host "would replace $(Join-Path $AppDir 'xboct-log.exe') with $binary"
	Write-Host "would mirror $web into $(Join-Path $AppDir 'web')"
	return
}

$head = (git -C $Repo rev-parse HEAD).Trim()
$apply = Join-Path $PSScriptRoot "deploy-apply.ps1"
$log = Join-Path $env:TEMP "xboct-log-deploy.log"
$applyArgs = @(
	"-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $apply,
	"-Service", $Service,
	"-AppDir", $AppDir,
	"-SourceExe", $binary,
	"-SourceWeb", $web,
	"-Port", "$Port",
	"-Version", $head,
	"-Log", $log
)
$commandLine = ($applyArgs | ForEach-Object { if ($_ -match '\s') { "`"$_`"" } else { $_ } }) -join " "

Write-Host "the next step stops the service, so Windows asks for administrator rights"
Remove-Item $log -ErrorAction SilentlyContinue
try {
	$child = Start-Process powershell -Verb RunAs -Wait -PassThru -WindowStyle Hidden -ArgumentList $commandLine
}
catch {
	throw "the deploy was cancelled: it needs administrator rights to stop and start the service"
}

if (Test-Path $log) { Get-Content $log | ForEach-Object { Write-Host $_ } }
exit $child.ExitCode
