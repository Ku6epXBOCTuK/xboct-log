use std::path::PathBuf;

pub const APP_NAME: &str = "xboct-log";
pub const DEFAULT_HOST: &str = "127.0.0.1";

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Invocation {
    Serve(Options),
    Restore(Restore),
    Openapi(PathBuf),
    Help,
    Version,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Options {
    pub port: u16,
    pub host: String,
    pub data: Option<PathBuf>,
    pub web: Option<PathBuf>,
    pub open: bool,
    pub portable: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Restore {
    pub action: RestoreAction,
    pub data: Option<PathBuf>,
    pub db: Option<PathBuf>,
    pub backups: Option<PathBuf>,
    pub port: Option<u16>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RestoreAction {
    List,
    Apply { source: PathBuf },
}

pub fn parse(
    args: &[String],
    env_port: Option<&str>,
    env_host: Option<&str>,
    env_data: Option<&str>,
) -> Result<Invocation, String> {
    if args.first().map(String::as_str) == Some("restore") {
        return parse_restore(&args[1..], env_port, env_data);
    }

    let mut port = match env_port {
        Some(value) => Some(parse_port(value)?),
        None => None,
    };
    let mut host = env_host.unwrap_or(DEFAULT_HOST).to_string();
    let mut data = env_data.map(PathBuf::from);
    let mut web = None;
    let mut open = true;
    let mut portable = false;
    let mut openapi = None;
    let mut help = false;
    let mut version = false;

    let mut index = 0;
    while index < args.len() {
        match args[index].as_str() {
            "--port" => {
                index += 1;
                port = Some(parse_port(args.get(index).map_or("", String::as_str))?);
            }
            "--host" => {
                index += 1;
                host = args.get(index).cloned().unwrap_or_default();
            }
            "--data" => {
                index += 1;
                data = Some(data_folder(args.get(index))?);
            }
            "--web" => {
                index += 1;
                web = Some(option_path(args.get(index), "--web")?);
            }
            "--no-open" => open = false,
            "--portable" => portable = true,
            "--openapi" => {
                index += 1;
                openapi = Some(option_path(args.get(index), "--openapi")?);
            }
            "--help" | "-h" => help = true,
            "--version" | "-v" => version = true,
            other => return Err(format!("unknown argument: {other}")),
        }
        index += 1;
    }

    if help {
        return Ok(Invocation::Help);
    }
    if version {
        return Ok(Invocation::Version);
    }
    if let Some(path) = openapi {
        return Ok(Invocation::Openapi(path));
    }
    if data.is_some() && portable {
        return Err("--data and --portable cannot be used together".to_string());
    }
    let port = port.ok_or("--port <n> or XBOCT_LOG_PORT is required")?;
    if data.is_none() && !portable {
        return Err("--data <dir>, --portable or XBOCT_LOG_DATA is required".to_string());
    }

    Ok(Invocation::Serve(Options {
        port,
        host,
        data,
        web,
        open,
        portable,
    }))
}

fn parse_restore(
    args: &[String],
    env_port: Option<&str>,
    env_data: Option<&str>,
) -> Result<Invocation, String> {
    let mut data = env_data
        .filter(|value| !value.is_empty())
        .map(PathBuf::from);
    let mut db = env_value("XBOCT_LOG_DB").map(PathBuf::from);
    let mut backups = env_value("XBOCT_LOG_BACKUP_DIR").map(PathBuf::from);
    let mut port = env_port.map(parse_port).transpose()?;
    let mut positionals: Vec<&str> = Vec::new();

    let mut index = 0;
    while index < args.len() {
        match args[index].as_str() {
            "--data" => {
                index += 1;
                data = Some(data_folder(args.get(index))?);
            }
            "--db" => {
                index += 1;
                db = Some(option_path(args.get(index), "--db")?);
            }
            "--backups" => {
                index += 1;
                backups = Some(option_path(args.get(index), "--backups")?);
            }
            "--port" => {
                index += 1;
                port = Some(parse_port(args.get(index).map_or("", String::as_str))?);
            }
            "--help" | "-h" => return Ok(Invocation::Help),
            other if other.starts_with('-') => return Err(format!("unknown argument: {other}")),
            other => positionals.push(other),
        }
        index += 1;
    }

    let action = match positionals.first().copied().unwrap_or("list") {
        "list" => {
            if let Some(extra) = positionals.get(1) {
                return Err(format!("unexpected argument: {extra}"));
            }
            RestoreAction::List
        }
        "apply" => {
            let source = positionals
                .get(1)
                .ok_or("restore apply needs the path of a snapshot")?;
            if let Some(extra) = positionals.get(2) {
                return Err(format!("unexpected argument: {extra}"));
            }
            RestoreAction::Apply {
                source: PathBuf::from(source),
            }
        }
        other => return Err(format!("unknown command: restore {other}")),
    };

    Ok(Invocation::Restore(Restore {
        action,
        data,
        db,
        backups,
        port,
    }))
}

fn env_value(name: &str) -> Option<String> {
    std::env::var(name).ok().filter(|value| !value.is_empty())
}

fn data_folder(value: Option<&String>) -> Result<PathBuf, String> {
    value
        .map(PathBuf::from)
        .ok_or_else(|| "--data needs a folder".to_string())
}

fn option_path(value: Option<&String>, flag: &str) -> Result<PathBuf, String> {
    value
        .map(PathBuf::from)
        .ok_or_else(|| format!("{flag} needs a path"))
}

fn parse_port(value: &str) -> Result<u16, String> {
    value
        .parse::<u16>()
        .map_err(|_| "--port must be zero or a positive integer".to_string())
}

pub fn help() -> String {
    format!(
        "usage: {APP_NAME} --port <port> --data <dir> [options]
       {APP_NAME} restore list --data <dir>
       {APP_NAME} restore apply <snapshot> --data <dir> [options]

  --port <port>  port to listen on, 0 picks a free one (required)
  --data <dir>   folder for the database, media and backups (required)
  --portable     keep the data in a data folder next to the executable
  --web <dir>    folder with the built spa (default: build next to the executable)
  --host <host>  address to bind (default {DEFAULT_HOST})
  --no-open      do not open the browser
  --openapi <f>  write the openapi document to <f> and exit
  --version      print the version
  --help         show this text

restore
  list           list the snapshots in the backup folder
  apply <snap>   replace the database with a snapshot while the server is stopped
  --db <file>    database file (default: <data>/{APP_NAME}.db)
  --backups <d>  backup folder (default: <data>/backups)
  --port <n>     port of the server, refused while it answers
                 (default: the port in <data>/instance.json)

The port and the data folder can also come from XBOCT_LOG_PORT and
XBOCT_LOG_DATA. An instance is identified by both, so every instance needs its
own pair."
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parse_args(args: &[&str]) -> Result<Invocation, String> {
        let owned: Vec<String> = args.iter().map(|value| (*value).to_string()).collect();
        parse(&owned, None, None, None)
    }

    fn serve(args: &[&str]) -> Options {
        match parse_args(args).unwrap() {
            Invocation::Serve(options) => options,
            other => panic!("expected a serve invocation, got {other:?}"),
        }
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
        let options = serve(&[
            "--port",
            "0",
            "--host",
            "0.0.0.0",
            "--data",
            "C:/data",
            "--web",
            "C:/app/build",
            "--no-open",
        ]);
        assert_eq!(options.port, 0);
        assert_eq!(options.host, "0.0.0.0");
        assert_eq!(options.data, Some(PathBuf::from("C:/data")));
        assert_eq!(options.web, Some(PathBuf::from("C:/app/build")));
        assert!(!options.open);
    }

    #[test]
    fn keeps_the_data_folder_next_to_a_portable_application() {
        let options = serve(&["--port", "1234", "--portable"]);
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
        let options = match parse(
            &explicit(&["--data", "C:/data"]),
            Some("1234"),
            Some("127.0.0.2"),
            None,
        )
        .unwrap()
        {
            Invocation::Serve(options) => options,
            other => panic!("expected a serve invocation, got {other:?}"),
        };
        assert_eq!(options.port, 1234);
        assert_eq!(options.host, "127.0.0.2");
    }

    #[test]
    fn takes_the_data_folder_from_the_environment() {
        let options = match parse(&explicit(&[]), Some("1234"), None, Some("C:/data")).unwrap() {
            Invocation::Serve(options) => options,
            other => panic!("expected a serve invocation, got {other:?}"),
        };
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
        assert_eq!(parse_args(&["--help"]).unwrap(), Invocation::Help);
        assert_eq!(parse_args(&["--version"]).unwrap(), Invocation::Version);
        assert_eq!(
            parse_args(&["--openapi", "openapi.json"]).unwrap(),
            Invocation::Openapi(PathBuf::from("openapi.json"))
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

    fn restore(args: &[&str]) -> Restore {
        match parse_args(args).unwrap() {
            Invocation::Restore(options) => options,
            other => panic!("expected a restore invocation, got {other:?}"),
        }
    }

    #[test]
    fn lists_the_snapshots_by_default() {
        let options = restore(&["restore", "--data", "C:/data"]);
        assert_eq!(options.action, RestoreAction::List);
        assert_eq!(options.data, Some(PathBuf::from("C:/data")));
        assert_eq!(options.db, None);
        assert_eq!(options.backups, None);
    }

    #[test]
    fn reads_the_restore_flags() {
        let options = restore(&[
            "restore",
            "apply",
            "C:/snaps/manual/xboct-log.db",
            "--data",
            "C:/data",
            "--db",
            "C:/elsewhere/tasks.db",
            "--backups",
            "C:/snaps",
            "--port",
            "45881",
        ]);
        assert_eq!(
            options.action,
            RestoreAction::Apply {
                source: PathBuf::from("C:/snaps/manual/xboct-log.db")
            }
        );
        assert_eq!(options.db, Some(PathBuf::from("C:/elsewhere/tasks.db")));
        assert_eq!(options.backups, Some(PathBuf::from("C:/snaps")));
        assert_eq!(options.port, Some(45881));
    }

    #[test]
    fn rejects_a_restore_apply_without_a_snapshot() {
        assert_eq!(
            parse_args(&["restore", "apply"]).unwrap_err(),
            "restore apply needs the path of a snapshot"
        );
    }

    #[test]
    fn rejects_an_unknown_restore_command() {
        assert_eq!(
            parse_args(&["restore", "drop"]).unwrap_err(),
            "unknown command: restore drop"
        );
        assert_eq!(
            parse_args(&["restore", "--nope"]).unwrap_err(),
            "unknown argument: --nope"
        );
        assert_eq!(
            parse_args(&["restore", "list", "extra"]).unwrap_err(),
            "unexpected argument: extra"
        );
    }
}
