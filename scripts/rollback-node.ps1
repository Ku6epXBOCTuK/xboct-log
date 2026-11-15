param(
	[string]$Service = "xboct-log",
	[string]$ServiceDir = (Join-Path $env:USERPROFILE ".xboct-log\app"),
	[int]$Port = 45881
)

$ErrorActionPreference = "Stop"

$Health = "http://127.0.0.1:$Port/api/health"
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
			# NOTE: the node server needs a moment before it answers health checks.
		}
		Start-Sleep -Milliseconds 500
	}
	return $null
}

if (-not (Get-Command nssm -ErrorAction SilentlyContinue)) { throw "nssm is not on PATH" }
if ((Read-Status) -eq "") { throw "service '$Service' does not exist" }
if (-not (Test-Path $NodeApp)) {
	throw "the node app entry is missing: $NodeApp; run deploy-rust.ps1 once to install the launcher"
}
if (-not (Test-Path $StartFile)) {
	throw "the service launcher is missing: $StartFile"
}

[IO.File]::WriteAllText($RuntimeFile, '{"mode":"node"}')

if ((Read-Status) -ne "SERVICE_STOPPED") {
	nssm stop $Service | Out-Null
	if (-not (Wait-Status "SERVICE_STOPPED")) { throw "service '$Service' did not stop" }
}
nssm start $Service | Out-Null

$answer = Wait-Health
if ($null -eq $answer) {
	throw "the node version did not answer $Health"
}

Write-Host "restored the node version"
Write-Host "service status: $(Read-Status)"
Write-Host "health: $($answer | ConvertTo-Json -Compress)"
