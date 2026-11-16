function Read-InstanceConfig {
	param(
		[string]$Instance = "",
		[string]$Config = ""
	)

	# NOTE: a terminal or editor started before the variable was set inherits the old environment, so fall back to the saved user value.
	$instanceDir = $env:XBOCT_LOG_INSTANCE_DIR
	if (-not $instanceDir) {
		$instanceDir = [Environment]::GetEnvironmentVariable("XBOCT_LOG_INSTANCE_DIR", "User")
	}

	$path = ""
	if ($Config) {
		$path = $Config
	}
	elseif ($Instance) {
		if (-not $instanceDir) {
			throw "set XBOCT_LOG_INSTANCE_DIR to the folder with <name>.env instance files, or pass -Config <file>"
		}
		$path = Join-Path $instanceDir "$Instance.env"
	}
	elseif ($env:XBOCT_LOG_INSTANCE) {
		$path = $env:XBOCT_LOG_INSTANCE
	}
	else {
		throw "name an instance, for example: pnpm deploy:rust <name> (XBOCT_LOG_INSTANCE_DIR), or pass -Config <file>"
	}

	if (-not (Test-Path $path)) {
		throw "instance config not found: $path"
	}

	$values = @{}
	foreach ($line in Get-Content $path) {
		$text = $line.Trim()
		if (-not $text -or $text.StartsWith("#")) { continue }
		$eq = $text.IndexOf("=")
		if ($eq -lt 1) { continue }
		$key = $text.Substring(0, $eq).Trim()
		$value = $text.Substring($eq + 1).Trim()
		if ($value.Length -ge 2) {
			$quote = $value.Substring(0, 1)
			if (($quote -eq '"' -or $quote -eq "'") -and $value.EndsWith($quote)) {
				$value = $value.Substring(1, $value.Length - 2)
			}
		}
		$values[$key] = $value
	}

	return [pscustomobject]@{
		Path   = (Resolve-Path $path).Path
		Values = $values
	}
}

function Get-InstanceValue {
	param(
		[pscustomobject]$Config,
		[string]$Key,
		$Explicit,
		$Default = ""
	)

	if ($Explicit) { return $Explicit }
	if ($Config.Values.ContainsKey($Key) -and $Config.Values[$Key]) { return $Config.Values[$Key] }
	return $Default
}
