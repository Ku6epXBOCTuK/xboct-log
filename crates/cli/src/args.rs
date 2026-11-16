use std::path::PathBuf;

pub const APP_NAME: &str = "xboct-log";
pub const DEFAULT_HOST: &str = "127.0.0.1";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Options {
    pub port: u16,
    pub host: String,
    pub data: Option<PathBuf>,
    pub web: Option<PathBuf>,
    pub open: bool,
    pub portable: bool,
    pub openapi: Option<PathBuf>,
    pub help: bool,
    pub version: bool,
}

pub fn parse(
    args: &[String],
    env_port: Option<&str>,
    env_host: Option<&str>,
    env_data: Option<&str>,
) -> Result<Options, String> {
    let mut port = match env_port {
        Some(value) => Some(parse_port(value)?),
        None => None,
    };
    let mut options = Options {
        port: 0,
        host: env_host.unwrap_or(DEFAULT_HOST).to_string(),
        data: env_data.map(PathBuf::from),
        web: None,
        open: true,
        portable: false,
        openapi: None,
        help: false,
        version: false,
    };

    let mut index = 0;
    while index < args.len() {
        match args[index].as_str() {
            "--port" => {
                index += 1;
                port = Some(parse_port(args.get(index).map_or("", String::as_str))?);
            }
            "--host" => {
                index += 1;
                options.host = args.get(index).cloned().unwrap_or_default();
            }
            "--data" => {
                index += 1;
                options.data = match args.get(index) {
                    Some(value) => Some(PathBuf::from(value)),
                    None => return Err("--data needs a folder".to_string()),
                };
            }
            "--web" => {
                index += 1;
                let dir = args
                    .get(index)
                    .ok_or_else(|| "--web needs a folder with the built spa".to_string())?;
                options.web = Some(PathBuf::from(dir));
            }
            "--no-open" => options.open = false,
            "--portable" => options.portable = true,
            "--openapi" => {
                index += 1;
                let file = args
                    .get(index)
                    .ok_or_else(|| "--openapi needs a file to write".to_string())?;
                options.openapi = Some(PathBuf::from(file));
            }
            "--help" | "-h" => options.help = true,
            "--version" | "-v" => options.version = true,
            other => return Err(format!("unknown argument: {other}")),
        }
        index += 1;
    }

    if options.help || options.version || options.openapi.is_some() {
        return Ok(options);
    }
    if options.data.is_some() && options.portable {
        return Err("--data and --portable cannot be used together".to_string());
    }
    options.port = port.ok_or("--port <n> or XBOCT_LOG_PORT is required")?;
    if options.data.is_none() && !options.portable {
        return Err("--data <dir>, --portable or XBOCT_LOG_DATA is required".to_string());
    }

    Ok(options)
}

fn parse_port(value: &str) -> Result<u16, String> {
    value
        .parse::<u16>()
        .map_err(|_| "--port must be zero or a positive integer".to_string())
}

pub fn help() -> String {
    format!(
        "usage: {APP_NAME} --port <port> --data <dir> [options]

  --port <port>  port to listen on, 0 picks a free one (required)
  --data <dir>   folder for the database, media and backups (required)
  --portable     keep the data in a data folder next to the executable
  --web <dir>    folder with the built spa (default: build next to the executable)
  --host <host>  address to bind (default {DEFAULT_HOST})
  --no-open      do not open the browser
  --openapi <f>  write the openapi document to <f> and exit
  --version      print the version
  --help         show this text

The port and the data folder can also come from XBOCT_LOG_PORT and
XBOCT_LOG_DATA. An instance is identified by both, so every instance needs its
own pair."
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parse_args(args: &[&str]) -> Result<Options, String> {
        let owned: Vec<String> = args.iter().map(|value| (*value).to_string()).collect();
        parse(&owned, None, None, None)
    }

    fn explicit(args: &[&str]) -> Vec<String> {
        args.iter().map(|value| (*value).to_string()).collect()
    }

    #[test]
    fn rejects_a_missing_port() {
        let error = parse_args(&["--data", "./here"]).unwrap_err();
        assert_eq!(error, "--port <n> or XBOCT_LOG_PORT is required");
    }

    #[test]
    fn rejects_a_missing_data_folder() {
        let error = parse_args(&["--port", "1234"]).unwrap_err();
        assert_eq!(
            error,
            "--data <dir>, --portable or XBOCT_LOG_DATA is required"
        );
    }

    #[test]
    fn reads_every_flag() {
        let options = parse_args(&[
            "--port",
            "0",
            "--host",
            "0.0.0.0",
            "--data",
            "C:/data",
            "--web",
            "C:/app/build",
            "--no-open",
        ])
        .unwrap();
        assert_eq!(options.port, 0);
        assert_eq!(options.host, "0.0.0.0");
        assert_eq!(options.data, Some(PathBuf::from("C:/data")));
        assert_eq!(options.web, Some(PathBuf::from("C:/app/build")));
        assert!(!options.open);
    }

    #[test]
    fn keeps_the_data_folder_next_to_a_portable_application() {
        let options = parse_args(&["--port", "1234", "--portable"]).unwrap();
        assert!(options.portable);
        assert_eq!(options.data, None);
    }

    #[test]
    fn rejects_a_portable_application_with_a_data_folder() {
        let error = parse_args(&["--port", "1234", "--portable", "--data", "./here"]).unwrap_err();
        assert_eq!(error, "--data and --portable cannot be used together");
    }

    #[test]
    fn takes_the_port_and_host_from_the_environment() {
        let options = parse(
            &explicit(&["--data", "C:/data"]),
            Some("1234"),
            Some("127.0.0.2"),
            None,
        )
        .unwrap();
        assert_eq!(options.port, 1234);
        assert_eq!(options.host, "127.0.0.2");
    }

    #[test]
    fn takes_the_data_folder_from_the_environment() {
        let options = parse(&explicit(&[]), Some("1234"), None, Some("C:/data")).unwrap();
        assert_eq!(options.data, Some(PathBuf::from("C:/data")));
        assert!(!options.portable);
    }

    #[test]
    fn rejects_a_portable_application_with_a_data_folder_from_the_environment() {
        let error = parse(
            &explicit(&["--portable"]),
            Some("1234"),
            None,
            Some("C:/data"),
        )
        .unwrap_err();
        assert_eq!(error, "--data and --portable cannot be used together");
    }

    #[test]
    fn skips_the_identity_checks_for_metadata_flags() {
        assert!(parse_args(&["--help"]).unwrap().help);
        assert!(parse_args(&["--version"]).unwrap().version);
        assert!(
            parse_args(&["--openapi", "openapi.json"])
                .unwrap()
                .openapi
                .is_some()
        );
    }

    #[test]
    fn rejects_an_unknown_argument() {
        assert_eq!(
            parse_args(&["--portable=1"]).unwrap_err(),
            "unknown argument: --portable=1"
        );
    }

    #[test]
    fn rejects_a_broken_port() {
        let message = "--port must be zero or a positive integer";
        assert_eq!(
            parse_args(&["--port", "-1", "--data", "."]).unwrap_err(),
            message
        );
        assert_eq!(
            parse_args(&["--port", "abc", "--data", "."]).unwrap_err(),
            message
        );
        assert_eq!(parse_args(&["--port"]).unwrap_err(), message);
        assert_eq!(parse(&[], Some("x"), None, None).unwrap_err(), message);
    }
}
