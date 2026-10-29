param(
	[string]$Version = "",
	[switch]$SkipBuild,
	[switch]$Installer,
	[string]$NodeDist = "latest-v26.x"
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if (-not $Version) {
	$Version = (Get-Content package.json -Raw | ConvertFrom-Json).version
}

$stageRoot = Join-Path $root ".dev\package"
$stage = Join-Path $stageRoot "xboct-log-$Version-win-x64"
$app = Join-Path $stage "app"
$runtime = Join-Path $stage "runtime"
$dist = Join-Path $root "dist"
$cache = Join-Path $root ".dev\cache"

Write-Host "packaging xboct-log $Version for win-x64"

if (-not $SkipBuild) {
	pnpm build
	if ($LASTEXITCODE -ne 0) { throw "pnpm build failed" }
}

if (Test-Path $stage) { Remove-Item -Recurse -Force $stage }
New-Item -ItemType Directory -Force $app, $runtime, $dist, $cache | Out-Null

Copy-Item bin -Destination $app -Recurse
Copy-Item build -Destination $app -Recurse
Copy-Item migrations -Destination $app -Recurse

$manifest = Get-Content package.json -Raw | ConvertFrom-Json
$minimal = [ordered]@{
	name    = "xboct-log"
	version = $Version
	private = $true
	type    = "module"
	dependencies = $manifest.dependencies
}
$minimal | ConvertTo-Json -Depth 5 | Set-Content (Join-Path $app "package.json") -Encoding utf8

Push-Location $app
try {
	pnpm install --prod --ignore-scripts --ignore-workspace --node-linker=hoisted --lockfile=false
	if ($LASTEXITCODE -ne 0) { throw "pnpm install --prod failed in the staging app" }
}
finally {
	Pop-Location
}

$nodeExe = Join-Path $cache "node-$NodeDist.exe"
if (-not (Test-Path $nodeExe)) {
	Write-Host "downloading node $NodeDist"
	Invoke-WebRequest "https://nodejs.org/dist/$NodeDist/win-x64/node.exe" -OutFile $nodeExe
}
Copy-Item $nodeExe (Join-Path $runtime "node.exe")

$launcher = @(
	'@echo off',
	'setlocal',
	'"%~dp0runtime\node.exe" "%~dp0app\bin\xboct-log.mjs" %*'
) -join "`r`n"
Set-Content (Join-Path $stage "xboct-log.cmd") ($launcher + "`r`n") -Encoding ascii
Set-Content (Join-Path $stage "xboct-log-portable.cmd") ($launcher.Replace('%*', '--portable %*') + "`r`n") -Encoding ascii

$readme = @(
	'Xboct Log',
	'',
	'Start: double-click xboct-log.cmd',
	'Your data is stored in %LOCALAPPDATA%\Xboct Log',
	'Portable mode: double-click xboct-log-portable.cmd, data stays in the data folder next to this file.',
	'',
	'Backups, media and the database live in the data folder, and are kept when the app is updated.'
) -join "`r`n"
Set-Content (Join-Path $stage "README.txt") ($readme + "`r`n") -Encoding utf8

$zip = Join-Path $dist "xboct-log-$Version-win-x64.zip"
if (Test-Path $zip) { Remove-Item -Force $zip }
Compress-Archive -Path (Join-Path $stage "*") -DestinationPath $zip
Write-Host "archive: $zip"

if ($Installer) {
	$iscc = Get-Command iscc -ErrorAction SilentlyContinue
	if (-not $iscc) {
		throw "iscc not found. Install Inno Setup 6 and rerun with -Installer."
	}
	& $iscc.Source "/DAppVersion=$Version" "/DStageDir=$stage" "/DOutputDir=$dist" (Join-Path $root "installer\xboct-log.iss")
	if ($LASTEXITCODE -ne 0) { throw "iscc failed" }
	Write-Host "installer: $dist"
}
