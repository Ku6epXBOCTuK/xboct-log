param(
	[string]$Version = "",
	[switch]$SkipBuild,
	[switch]$Installer,
	[switch]$NoArchive
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if (-not $Version) {
	$Version = (Get-Content package.json -Raw | ConvertFrom-Json).version
}

$stageRoot = Join-Path $root ".dev\package"
$stage = Join-Path $stageRoot "xboct-log-$Version-win-x64"
$dist = Join-Path $root "dist"

Write-Host "packaging xboct-log $Version for win-x64"

$cargoVersion = (Select-String -Path Cargo.toml -Pattern '^version = "([^"]+)"$').Matches[0].Groups[1].Value
if ($cargoVersion -ne $Version) {
	throw "Cargo.toml has $cargoVersion, expected $Version"
}

if (-not $SkipBuild) {
	$env:XBOCT_LOG_STATIC = "1"
	try {
		pnpm build
		if ($LASTEXITCODE -ne 0) { throw "pnpm build failed (exit $LASTEXITCODE)" }
	}
	finally {
		Remove-Item Env:\XBOCT_LOG_STATIC -ErrorAction SilentlyContinue
	}

	cargo build --release --locked -p xboct-log-cli
	if ($LASTEXITCODE -ne 0) { throw "cargo build failed (exit $LASTEXITCODE)" }
}

$targetDir = (cargo metadata --format-version 1 --no-deps | ConvertFrom-Json).target_directory
$binary = Join-Path $targetDir "release\xboct-log.exe"
if (-not (Test-Path $binary)) { throw "the rust binary is missing: $binary" }

$web = Join-Path $root "build"
if (-not (Test-Path (Join-Path $web "index.html"))) {
	throw "build\index.html is missing; run pnpm build with XBOCT_LOG_STATIC=1"
}

if (Test-Path $stage) { Remove-Item -Recurse -Force $stage }
New-Item -ItemType Directory -Force $stage, $dist | Out-Null

Copy-Item $binary (Join-Path $stage "xboct-log.exe")
Copy-Item $web (Join-Path $stage "build") -Recurse

$portable = @(
	'@echo off',
	'setlocal',
	'"%~dp0xboct-log.exe" --portable %*'
) -join "`r`n"
Set-Content (Join-Path $stage "xboct-log-portable.cmd") ($portable + "`r`n") -Encoding ascii

$readme = @(
	'Xboct Log',
	'',
	'Start: double-click xboct-log.exe',
	'Your data is stored in %LOCALAPPDATA%\Xboct Log',
	'Portable mode: double-click xboct-log-portable.cmd, data stays in the data folder next to this file.',
	'',
	'Backups, media and the database live in the data folder, and are kept when the app is updated.'
) -join "`r`n"
Set-Content (Join-Path $stage "README.txt") ($readme + "`r`n") -Encoding utf8

$zip = Join-Path $dist "xboct-log-$Version-win-x64.zip"
if (-not $NoArchive) {
	if (Test-Path $zip) { Remove-Item -Force $zip }
	Compress-Archive -Path (Join-Path $stage "*") -DestinationPath $zip
	Write-Host "archive: $zip"
}

if ($Installer) {
	$iscc = Get-Command iscc -ErrorAction SilentlyContinue
	if (-not $iscc) {
		throw "iscc not found. Install Inno Setup 6 and rerun with -Installer."
	}
	& $iscc.Source "/DAppVersion=$Version" "/DStageDir=$stage" "/DOutputDir=$dist" (Join-Path $root "installer\xboct-log.iss")
	if ($LASTEXITCODE -ne 0) { throw "iscc failed" }
	Write-Host "installer: $dist"
}
