param(
	[Parameter(Mandatory)][string]$Service,
	[Parameter(Mandatory)][string]$AppDir,
	[Parameter(Mandatory)][string]$SourceExe,
	[Parameter(Mandatory)][string]$SourceWeb,
	[Parameter(Mandatory)][int]$Port = 0,
	[Parameter(Mandatory)][string]$Version,
	[string]$Log = ""
)

$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "nssm-service.ps1")

Assert-Elevated

if ($Log) { Start-Transcript -Path $Log -Force | Out-Null }

$Health = "http://127.0.0.1:$Port/api/health"

function Read-Status {
	return (Invoke-Nssm @("status", $Service)).Text
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
	if ((Read-Status) -eq "SERVICE_STOPPED") { return }
	$result = Invoke-Nssm @("stop", $Service)
	if (Wait-Status "SERVICE_STOPPED" 15) { return }

	$wrapper = (Get-CimInstance Win32_Service -Filter "Name='$Service'").ProcessId
	foreach ($childId in @(Get-CimInstance Win32_Process -Filter "ParentProcessId=$wrapper" | Select-Object -ExpandProperty ProcessId)) {
		Stop-Process -Id $childId -Force -ErrorAction SilentlyContinue
	}
	if (Wait-Status "SERVICE_STOPPED" 15) { return }

	throw "service '$Service' did not stop: status $(Read-Status), nssm said '$($result.Text)'"
}

function Start-App {
	$null = Invoke-Nssm @("start", $Service)
	$null = Wait-Status "SERVICE_RUNNING" 20
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

Write-Host "stopping the service to replace the binary"
Stop-App
try {
	Copy-Binary $SourceExe (Join-Path $AppDir "xboct-log.exe")
	$null = robocopy $SourceWeb (Join-Path $AppDir "web") /MIR /NFL /NDL /NJH /NJS
	if ($LASTEXITCODE -ge 8) { throw "robocopy failed (exit $LASTEXITCODE)" }
	"$Version  $(Get-Date -Format o)" | Set-Content (Join-Path $AppDir "version.txt")
}
catch {
	Start-App
	throw
}

Start-App

$answer = Wait-Health
if ($null -eq $answer) {
	throw "the rust binary did not answer $Health; check the service log in $(Join-Path $AppDir 'logs')"
}

Write-Host "deployed $Version to $AppDir"
Write-Host "service status: $(Read-Status)"
Write-Host "health: $($answer | ConvertTo-Json -Compress)"
