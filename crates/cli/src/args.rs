use std::path::{Path, PathBuf};

pub const APP_NAME: &str = "xboct-log";
pub const DEFAULT_PORT: u16 = 45881;
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

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[allow(dead_code)]
pub enum Platform {
    Windows,
    MacOs,
    Other,
}

impl Platform {
    pub fn current() -> Self {
        #[cfg(target_os = "windows")]
        {
            Self::Windows
        }
        #[cfg(target_os = "macos")]
        {
            Self::MacOs
        }
        #[cfg(not(any(target_os = "windows", target_os = "macos")))]
        {
            Self::Other
        }
    }
}

pub fn parse(
    args: &[String],
    env_port: Option<&str>,
    env_host: Option<&str>,
) -> Result<Options, String> {
    let port = match env_port {
        Some(value) => parse_port(value)?,
        None => DEFAULT_PORT,
    };
    let mut options = Options {
        port,
        host: env_host.unwrap_or(DEFAULT_HOST).to_string(),
        data: None,
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
                options.port = parse_port(args.get(index).map_or("", String::as_str))?;
            }
            "--host" => {
                index += 1;
                options.host = args.get(index).cloned().unwrap_or_default();
            }
            "--data" => {
                index += 1;
                options.data = args.get(index).map(PathBuf::from);
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

    Ok(options)
}

fn parse_port(value: &str) -> Result<u16, String> {
    value
        .parse::<u16>()
        .map_err(|_| "--port must be zero or a positive integer".to_string())
}

pub fn default_data_dir(
    options: &Options,
    platform: Platform,
    app_root: &Path,
    home: &Path,
    env: impl Fn(&str) -> Option<String>,
) -> PathBuf {
    let env_path = |name: &str| env(name).filter(|value| !value.is_empty());

    if let Some(data) = &options.data {
        return data.clone();
    }
    if let Some(data) = env_path("XBOCT_LOG_DATA") {
        return data.into();
    }
    if options.portable {
        return app_root.join("data");
    }
    match platform {
        Platform::Windows => env_path("LOCALAPPDATA")
            .map(PathBuf::from)
            .unwrap_or_else(|| home.join("AppData").join("Local"))
            .join("Xboct Log"),
        Platform::MacOs => home
            .join("Library")
            .join("Application Support")
            .join("Xboct Log"),
        Platform::Other => env_path("XDG_DATA_HOME")
            .map(PathBuf::from)
            .unwrap_or_else(|| home.join(".local").join("share"))
            .join(APP_NAME),
    }
}

pub fn help() -> String {
    format!(
        "usage: {APP_NAME} [options]

  --data <dir>   folder for the database, media and backups
  --web <dir>    folder with the built spa (default: build next to the executable)
  --port <port>  port to listen on, 0 picks a free one (default {DEFAULT_PORT})
  --host <host>  address to bind (default {DEFAULT_HOST})
  --no-open      do not open the browser
  --portable     keep the data next to the application
  --openapi <f>  write the openapi document to <f> and exit
  --version      print the version
  --help         show this text"
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parse_args(args: &[&str]) -> Result<Options, String> {
        let owned: Vec<String> = args.iter().map(|value| (*value).to_string()).collect();
        parse(&owned, None, None)
    }

    #[test]
    fn applies_the_launcher_defaults() {
        let options = parse_args(&[]).unwrap();
        assert_eq!(options.port, DEFAULT_PORT);
        assert_eq!(options.host, DEFAULT_HOST);
        assert!(options.open);
        assert!(!options.portable);
        assert!(!options.version);
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
            "--portable",
        ])
        .unwrap();
        assert_eq!(options.port, 0);
        assert_eq!(options.host, "0.0.0.0");
        assert_eq!(options.data, Some(PathBuf::from("C:/data")));
        assert_eq!(options.web, Some(PathBuf::from("C:/app/build")));
        assert!(!options.open);
        assert!(options.portable);
    }

    #[test]
    fn takes_the_port_and_host_from_the_environment() {
        let options = parse(&[], Some("1234"), Some("127.0.0.2")).unwrap();
        assert_eq!(options.port, 1234);
        assert_eq!(options.host, "127.0.0.2");
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
        assert_eq!(parse_args(&["--port", "-1"]).unwrap_err(), message);
        assert_eq!(parse_args(&["--port", "abc"]).unwrap_err(), message);
        assert_eq!(parse_args(&["--port"]).unwrap_err(), message);
        assert_eq!(parse(&[], Some("x"), None).unwrap_err(), message);
    }

    #[test]
    fn keeps_the_data_folder_next_to_a_portable_application() {
        let options = parse_args(&["--portable"]).unwrap();
        let dir = default_data_dir(
            &options,
            Platform::Windows,
            Path::new("C:/app"),
            Path::new("C:/Users/me"),
            |_| None,
        );
        assert_eq!(dir, PathBuf::from("C:/app/data"));
    }

    #[test]
    fn follows_the_platform_data_folders() {
        let options = parse_args(&[]).unwrap();
        let home = Path::new("C:/Users/me");
        let windows = default_data_dir(
            &options,
            Platform::Windows,
            Path::new("C:/app"),
            home,
            |name| (name == "LOCALAPPDATA").then(|| "C:/Users/me/AppData/Local".to_string()),
        );
        assert_eq!(
            windows,
            PathBuf::from("C:/Users/me/AppData/Local/Xboct Log")
        );

        let mac = default_data_dir(&options, Platform::MacOs, Path::new("/app"), home, |_| None);
        assert_eq!(
            mac,
            PathBuf::from("C:/Users/me/Library/Application Support/Xboct Log")
        );

        let linux = default_data_dir(
            &options,
            Platform::Other,
            Path::new("/app"),
            Path::new("/home/me"),
            |_| None,
        );
        assert_eq!(linux, PathBuf::from("/home/me/.local/share/xboct-log"));
    }

    #[test]
    fn prefers_the_data_flag_then_the_environment() {
        let explicit = parse_args(&["--data", "./here"]).unwrap();
        assert_eq!(
            default_data_dir(
                &explicit,
                Platform::Other,
                Path::new("/app"),
                Path::new("/home/me"),
                |_| None
            ),
            PathBuf::from("./here")
        );

        let options = parse_args(&[]).unwrap();
        let from_env = default_data_dir(
            &options,
            Platform::Other,
            Path::new("/app"),
            Path::new("/home/me"),
            |name| (name == "XBOCT_LOG_DATA").then(|| "/srv/data".to_string()),
        );
        assert_eq!(from_env, PathBuf::from("/srv/data"));
    }
}
