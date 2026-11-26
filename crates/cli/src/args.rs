use std::path::PathBuf;

mod restore;
use restore::parse_restore;

use clap::{Args, Parser, Subcommand, error::ErrorKind};

pub const APP_NAME: &str = "xboct-log";
pub const DEFAULT_HOST: &str = "127.0.0.1";

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Invocation {
    Serve(Options),
    Restore(Restore),
    Openapi(PathBuf),
    Help(String),
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

#[derive(Debug, Parser)]
#[command(
    name = APP_NAME,
    version,
    disable_help_subcommand = true,
    after_help = "The port and the data folder can also come from XBOCT_LOG_PORT and\nXBOCT_LOG_DATA. An instance is identified by both, so every instance needs its\nown pair."
)]
struct Cli {
    #[arg(
        long,
        value_name = "port",
        allow_hyphen_values = true,
        help = "port to listen on, 0 picks a free one"
    )]
    port: Option<u16>,
    #[arg(
        long,
        value_name = "dir",
        conflicts_with = "portable",
        help = "folder for the database, media and backups"
    )]
    data: Option<PathBuf>,
    #[arg(long, help = "keep the data in a data folder next to the executable")]
    portable: bool,
    #[arg(
        long,
        value_name = "dir",
        help = "folder with the built spa (default: build next to the executable)"
    )]
    web: Option<PathBuf>,
    #[arg(
        long,
        value_name = "host",
        default_value = DEFAULT_HOST,
        help = "address to bind (default 127.0.0.1)"
    )]
    host: String,
    #[arg(long = "no-open", help = "do not open the browser")]
    no_open: bool,
    #[arg(
        long,
        value_name = "file",
        help = "write the openapi document to <file> and exit"
    )]
    openapi: Option<PathBuf>,
    #[command(subcommand)]
    command: Option<Command>,
}

#[derive(Debug, Subcommand)]
enum Command {
    #[command(
        about = "list the snapshots or replace the database with a snapshot while the server is stopped"
    )]
    Restore(RestoreArgs),
}

#[derive(Debug, Args)]
struct RestoreArgs {
    #[command(subcommand)]
    action: Option<RestoreCommand>,
    #[arg(
        long,
        value_name = "dir",
        global = true,
        help = "folder for the database, media and backups"
    )]
    data: Option<PathBuf>,
    #[arg(
        long,
        value_name = "file",
        global = true,
        help = "database file (default: <data>/xboct-log.db)"
    )]
    db: Option<PathBuf>,
    #[arg(
        long,
        value_name = "dir",
        global = true,
        help = "backup folder (default: <data>/backups)"
    )]
    backups: Option<PathBuf>,
    #[arg(
        long,
        value_name = "port",
        global = true,
        allow_hyphen_values = true,
        help = "port of the server, refused while it answers (default: the port in <data>/instance.json)"
    )]
    port: Option<u16>,
}

#[derive(Debug, Subcommand)]
enum RestoreCommand {
    #[command(about = "list the snapshots in the backup folder")]
    List,
    #[command(about = "replace the database with a snapshot while the server is stopped")]
    Apply {
        #[arg(value_name = "snapshot", help = "path to the snapshot")]
        source: PathBuf,
    },
}

enum ReadError {
    Help(String),
    Version,
    Message(String),
}

impl ReadError {
    fn into_result(self) -> Result<Invocation, String> {
        match self {
            ReadError::Help(text) => Ok(Invocation::Help(text)),
            ReadError::Version => Ok(Invocation::Version),
            ReadError::Message(message) => Err(message),
        }
    }
}

pub fn parse(
    args: &[String],
    env_port: Option<&str>,
    env_host: Option<&str>,
    env_data: Option<&str>,
) -> Result<Invocation, String> {
    if args.first().map(String::as_str) == Some("restore") {
        return parse_restore(args, env_port, env_data);
    }

    let argv = with_defaults(
        args,
        &[
            ("--port", env_port),
            ("--host", env_host),
            ("--data", env_data),
        ],
    );
    let cli = match read(argv) {
        Ok(cli) => cli,
        Err(error) => return error.into_result(),
    };

    if let Some(path) = cli.openapi {
        return Ok(Invocation::Openapi(path));
    }
    let port = cli
        .port
        .ok_or_else(|| "--port <n> or XBOCT_LOG_PORT is required".to_string())?;
    if cli.data.is_none() && !cli.portable {
        return Err("--data <dir>, --portable or XBOCT_LOG_DATA is required".to_string());
    }

    Ok(Invocation::Serve(Options {
        port,
        host: cli.host,
        data: cli.data,
        web: cli.web,
        open: !cli.no_open,
        portable: cli.portable,
    }))
}

fn with_defaults(args: &[String], defaults: &[(&str, Option<&str>)]) -> Vec<String> {
    let mut argv = Vec::with_capacity(1 + args.len() + 2 * defaults.len());
    argv.push(APP_NAME.to_string());
    argv.extend(args.iter().cloned());
    for (flag, value) in defaults {
        let Some(value) = value.filter(|value| !value.is_empty()) else {
            continue;
        };
        if argv
            .iter()
            .any(|arg| arg == flag || arg.starts_with(&format!("{flag}=")))
        {
            continue;
        }
        argv.push((*flag).to_string());
        argv.push((*value).to_string());
    }
    argv
}

fn read(argv: Vec<String>) -> Result<Cli, ReadError> {
    match Cli::try_parse_from(argv) {
        Ok(cli) => Ok(cli),
        Err(error) => match error.kind() {
            ErrorKind::DisplayHelp => Err(ReadError::Help(error.to_string())),
            ErrorKind::DisplayVersion => Err(ReadError::Version),
            _ => Err(ReadError::Message(error.to_string().trim_end().to_string())),
        },
    }
}

fn env_value(name: &str) -> Option<String> {
    std::env::var(name).ok().filter(|value| !value.is_empty())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn explicit(args: &[&str]) -> Vec<String> {
        args.iter().map(|value| (*value).to_string()).collect()
    }

    fn parse_args(args: &[&str]) -> Result<Invocation, String> {
        parse(&explicit(args), None, None, None)
    }

    fn serve(args: &[&str]) -> Options {
        match parse_args(args).unwrap() {
            Invocation::Serve(options) => options,
            other => panic!("expected a serve invocation, got {other:?}"),
        }
    }

    fn restore(args: &[&str]) -> Restore {
        match parse_args(args).unwrap() {
            Invocation::Restore(options) => options,
            other => panic!("expected a restore invocation, got {other:?}"),
        }
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
    fn takes_the_flag_value_from_an_equals_sign() {
        let options = serve(&["--port=1234", "--data=C:/data"]);
        assert_eq!(options.port, 1234);
        assert_eq!(options.data, Some(PathBuf::from("C:/data")));
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
        assert!(error.contains("cannot be used with"));
        assert!(error.contains("--portable"));
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
    fn keeps_the_flag_over_the_environment() {
        let options = match parse(
            &explicit(&["--port", "2000", "--data", "C:/flag"]),
            Some("1234"),
            None,
            Some("C:/env"),
        )
        .unwrap()
        {
            Invocation::Serve(options) => options,
            other => panic!("expected a serve invocation, got {other:?}"),
        };
        assert_eq!(options.port, 2000);
        assert_eq!(options.data, Some(PathBuf::from("C:/flag")));
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
        assert!(error.contains("cannot be used with"));
    }

    #[test]
    fn skips_the_identity_checks_for_metadata_flags() {
        let help = match parse_args(&["--help"]).unwrap() {
            Invocation::Help(text) => text,
            other => panic!("expected help, got {other:?}"),
        };
        assert!(help.contains("--portable"));
        assert!(help.contains("restore"));
        assert_eq!(parse_args(&["--version"]).unwrap(), Invocation::Version);
        assert_eq!(
            parse_args(&["--openapi", "openapi.json"]).unwrap(),
            Invocation::Openapi(PathBuf::from("openapi.json"))
        );
    }

    #[test]
    fn rejects_an_unknown_argument() {
        let error = parse_args(&["--nope"]).unwrap_err();
        assert!(error.contains("--nope"));
        assert!(error.contains("unexpected argument"));
    }

    #[test]
    fn rejects_a_broken_port() {
        for args in [
            &["--port", "-1", "--data", "."],
            &["--port", "abc", "--data", "."],
        ] {
            let error = parse_args(args).unwrap_err();
            assert!(error.contains("invalid value"), "{error}");
        }
        let missing = parse_args(&["--port"]).unwrap_err();
        assert!(missing.contains("a value is required"), "{missing}");
        let environment = parse(&[], Some("x"), None, Some(".")).unwrap_err();
        assert!(environment.contains("invalid value"), "{environment}");
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
    fn reads_the_restore_flags_before_the_command() {
        let options = restore(&["restore", "--data", "C:/data", "apply", "C:/snap.db"]);
        assert_eq!(
            options.action,
            RestoreAction::Apply {
                source: PathBuf::from("C:/snap.db")
            }
        );
        assert_eq!(options.data, Some(PathBuf::from("C:/data")));
    }

    #[test]
    fn rejects_a_restore_apply_without_a_snapshot() {
        let error = parse_args(&["restore", "apply"]).unwrap_err();
        assert!(error.contains("<snapshot>"), "{error}");
    }

    #[test]
    fn rejects_an_unknown_restore_command() {
        let command = parse_args(&["restore", "drop"]).unwrap_err();
        assert!(command.contains("unrecognized subcommand"), "{command}");
        let flag = parse_args(&["restore", "--nope"]).unwrap_err();
        assert!(flag.contains("unexpected argument"), "{flag}");
        let extra = parse_args(&["restore", "list", "extra"]).unwrap_err();
        assert!(extra.contains("unexpected argument"), "{extra}");
    }
}
