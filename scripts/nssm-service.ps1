function Invoke-Nssm([string[]]$NssmArgs) {
	$previous = $ErrorActionPreference
	$ErrorActionPreference = "Continue"
	try {
		$output = & nssm @NssmArgs 2>&1
		$code = $LASTEXITCODE
	}
	finally {
		$ErrorActionPreference = $previous
	}
	return [pscustomobject]@{
		Code = $code
		Text = (($output | Where-Object { $_ -is [string] }) -join "`n").Trim()
	}
}

function Get-ServiceValue([string]$Service, [string]$Key) {
	$result = Invoke-Nssm @("get", $Service, $Key)
	if ($result.Code -ne 0) { throw "service '$Service' does not exist" }
	return $result.Text
}

function Find-XboctServices {
	$services = @(Get-CimInstance Win32_Service)

	$direct = @($services | Where-Object { $_.PathName -match "(?i)xboct[-_]log" })
	if ($direct.Count -gt 0) { return $direct.Name }

	$hosted = @(
		$services |
			Where-Object { $_.PathName -match "(?i)nssm" } |
			Where-Object {
				$application = Get-ServiceValue $_.Name "Application"
				$parameters = Get-ServiceValue $_.Name "AppParameters"
				"$application $parameters" -match "(?i)xboct[-_]log"
			}
	)
	if ($hosted.Count -gt 0) { return $hosted.Name }

	return @($services | Where-Object { $_.Name -match "(?i)xboct" -or $_.DisplayName -match "(?i)xboct" }).Name
}

function Test-Elevated {
	$principal = [Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())
	return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Assert-Elevated {
	if (Test-Elevated) { return }
	throw "stopping and starting a service needs administrator rights; open an elevated terminal and run the same command again"
}

function Resolve-ServiceName([string]$Service) {
	if ($Service) { return $Service }

	$found = @(Find-XboctServices)
	if ($found.Count -eq 1) { return $found[0] }
	if ($found.Count -eq 0) {
		throw "no service on this host runs xboct-log; add SERVICE= to the instance config or pass -Service"
	}
	throw "several services run xboct-log: $($found -join ', '); add SERVICE= to the instance config"
}
