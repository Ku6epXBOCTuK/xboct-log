param(
	[Parameter(Mandatory = $true)][string]$Version,
	[switch]$SkipBuild,
	[switch]$Installer
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if ($Version -notmatch '^\d+\.\d+\.\d+$') {
	throw "Version must look like 1.2.3"
}

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
	throw "gh is not installed. Install the GitHub CLI and run 'gh auth login'."
}

$status = git status --porcelain
if ($status) {
	throw "The working tree is dirty. Commit the changes before releasing."
}

$tag = "v$Version"
if (git tag --list $tag) {
	throw "Tag $tag already exists."
}

function Set-Version([string]$file, [string]$value) {
	$content = Get-Content $file -Raw
	$updated = $content -replace '"version": "[^"]+"', ('"version": "' + $value + '"')
	if ($updated -eq $content) { throw "no version field in $file" }
	Set-Content -Path $file -Value $updated -NoNewline -Encoding utf8
}

Set-Version "package.json" $Version
Set-Version "vscode-extension/package.json" $Version

$packageArgs = @("-Version", $Version)
if ($SkipBuild) { $packageArgs += "-SkipBuild" }
if ($Installer) { $packageArgs += "-Installer" }
& (Join-Path $PSScriptRoot "package-win.ps1") @packageArgs

Push-Location vscode-extension
try {
	npm run compile
	if ($LASTEXITCODE -ne 0) { throw "extension compile failed" }
	npx vsce package --no-dependencies --out "../dist/xboct-log-vscode-$Version.vsix"
	if ($LASTEXITCODE -ne 0) { throw "vsix packaging failed" }
}
finally {
	Pop-Location
}

$files = Get-ChildItem "dist" -File | Where-Object { $_.Name -match [regex]::Escape($Version) } | Select-Object -ExpandProperty FullName
if (-not $files) { throw "no release artifacts in dist" }

gh release create $tag --title "Xboct Log $Version" --generate-notes @files
if ($LASTEXITCODE -ne 0) { throw "gh release create failed" }

Write-Host "release $tag published"
Write-Host "commit the version bump yourself: package.json, vscode-extension/package.json"
