#![forbid(unsafe_code)]

mod args;
mod health;
mod instance;

use std::{
    fs,
    io::{IsTerminal, Write},
    path::{Path, PathBuf},
    process::{ExitCode, Stdio},
    sync::Arc,
    time::Duration,
};

use chrono::{Local, SecondsFormat, Utc};
use tracing::{Event, Subscriber};
use tracing_subscriber::{
    Layer,
    fmt::{FmtContext, FormatEvent, FormatFields, format::Writer},
    layer::SubscriberExt,
    registry::LookupSpan,
    util::SubscriberInitExt,
};
use xboct_log_core::{Config, Db, Events, fingerprint_path, prune_activity, start_scheduler};
use xboct_log_server::{AppState, app};

use crate::args::{APP_NAME, Options, Platform};

const FORCED_EXIT: Duration = Duration::from_secs(5);

#[tokio::main]
async fn main() -> ExitCode {
    let raw: Vec<String> = std::env::args().skip(1).collect();
    let env_port = std::env::var("XBOCT_LOG_PORT").ok();
    let env_host = std::env::var("XBOCT_LOG_HOST").ok();

    let options = match args::parse(&raw, env_port.as_deref(), env_host.as_deref()) {
        Ok(options) => options,
        Err(message) => return fail(&message),
    };

    if options.help {
        println!("{}", args::help());
        return ExitCode::SUCCESS;
    }
    if options.version {
        println!("{}", env!("CARGO_PKG_VERSION"));
        return ExitCode::SUCCESS;
    }
    if let Some(path) = &options.openapi {
        return match write_openapi(path) {
            Ok(()) => ExitCode::SUCCESS,
            Err(message) => fail(&message),
        };
    }

    match run(options).await {
        Ok(()) => ExitCode::SUCCESS,
        Err(message) => fail(&message),
    }
}

fn fail(message: &str) -> ExitCode {
    eprintln!("{APP_NAME}: {message}");
    ExitCode::FAILURE
}

fn write_openapi(path: &Path) -> Result<(), String> {
    let document = serde_json::to_string_pretty(&xboct_log_server::openapi::document())
        .map_err(|error| error.to_string())?;
    fs::write(path, format!("{document}\n"))
        .map_err(|error| format!("cannot write {}: {error}", path.display()))
}

async fn run(options: Options) -> Result<(), String> {
    let data_dir = resolve_data_dir(&options)?;
    let instance_file = data_dir.join("instance.json");
    let log_file = data_dir.join("logs").join(format!("{APP_NAME}.log"));
    let media_dir = data_dir.join("media");
    let backup_dir = data_dir.join("backups");
    let data_id = fingerprint_path(&data_dir);

    if let Some(running) = health::check(options.port).await {
        if let Some(running_data) = running.data
            && running_data != data_id
        {
            return Err(format!(
                "port {} on {} is used by another {APP_NAME} with a different data folder; stop it or pick another port with --port <n>",
                options.port, options.host
            ));
        }
        let url = format!("http://{}:{}/", options.host, options.port);
        log_line(&log_file, &format!("already running at {url}"));
        if options.open {
            open_browser(&url);
        }
        return Ok(());
    }

    for dir in [
        data_dir.clone(),
        data_dir.join("logs"),
        media_dir.clone(),
        backup_dir.clone(),
    ] {
        fs::create_dir_all(&dir)
            .map_err(|error| format!("cannot create {}: {error}", dir.display()))?;
    }

    if let Some(previous) = instance::Instance::read(&instance_file)
        && previous.pid != std::process::id()
    {
        log_line(&log_file, &format!("stale instance {}", previous.pid));
    }
    instance::Instance::remove(&instance_file);

    install_tracing(&log_file);

    let listener = match tokio::net::TcpListener::bind((options.host.as_str(), options.port)).await
    {
        Ok(listener) => listener,
        Err(_) => {
            return Err(format!(
                "port {} on {} is busy; pick another with --port <n>, or --port 0 for any free port",
                options.port, options.host
            ));
        }
    };
    let port = listener
        .local_addr()
        .map_err(|error| error.to_string())?
        .port();

    let db_path = data_dir.join(format!("{APP_NAME}.db"));
    let web_dir = resolve_web_dir(&options);
    let config = Config::from_lookup(|name| match name {
        "XBOCT_LOG_DB" => Some(db_path.to_string_lossy().into_owned()),
        "XBOCT_LOG_MEDIA_DIR" => Some(media_dir.to_string_lossy().into_owned()),
        "XBOCT_LOG_BACKUP_DIR" => Some(backup_dir.to_string_lossy().into_owned()),
        "XBOCT_LOG_WEB_DIR" => Some(web_dir.to_string_lossy().into_owned()),
        _ => std::env::var(name).ok(),
    })
    .map_err(|error| error.to_string())?;

    let db = Db::open(&config.db_path)
        .await
        .map_err(|error| error.to_string())?;
    db.migrate().await.map_err(|error| error.to_string())?;
    prune_activity(&db, config.activity_keep_days, Local::now())
        .await
        .map_err(|error| error.to_string())?;

    let db = Arc::new(db);
    start_scheduler(db.clone(), config.backup_dir.clone(), config.backup.clone());

    let state = AppState {
        db: db.clone(),
        config: Arc::new(config),
        events: Arc::new(Events::new()),
    };

    let display_host = if options.host == "0.0.0.0" {
        "127.0.0.1"
    } else {
        options.host.as_str()
    };
    let url = format!("http://{display_host}:{port}/");
    instance::Instance {
        pid: std::process::id(),
        port,
        url: url.clone(),
        version: env!("CARGO_PKG_VERSION").to_string(),
    }
    .write(&instance_file)
    .map_err(|error| format!("cannot write {}: {error}", instance_file.display()))?;
    log_line(
        &log_file,
        &format!("listening on {url} (data: {})", data_dir.display()),
    );
    if options.open {
        open_browser(&url);
    }

    let shutdown_log = log_file.clone();
    axum::serve(listener, app(state))
        .with_graceful_shutdown(async move {
            let signal = wait_for_signal().await;
            log_line(&shutdown_log, &format!("stopping on {signal}"));
            tokio::spawn(async {
                tokio::time::sleep(FORCED_EXIT).await;
                std::process::exit(0);
            });
        })
        .await
        .map_err(|error| error.to_string())?;

    instance::Instance::remove(&instance_file);
    db.pool().close().await;
    Ok(())
}

fn resolve_data_dir(options: &Options) -> Result<PathBuf, String> {
    let home = std::env::var_os("USERPROFILE")
        .or_else(|| std::env::var_os("HOME"))
        .map(PathBuf::from)
        .unwrap_or_default();
    let app_root = std::env::current_exe()
        .ok()
        .and_then(|exe| exe.parent().map(Path::to_path_buf))
        .unwrap_or_else(|| PathBuf::from("."));
    let dir = args::default_data_dir(options, Platform::current(), &app_root, &home, |name| {
        std::env::var(name).ok()
    });
    std::path::absolute(dir).map_err(|error| error.to_string())
}

fn resolve_web_dir(options: &Options) -> PathBuf {
    if let Some(dir) = &options.web {
        return dir.clone();
    }
    if let Some(dir) = std::env::var_os("XBOCT_LOG_WEB_DIR").filter(|dir| !dir.is_empty()) {
        return dir.into();
    }
    let next_to_exe = std::env::current_exe()
        .ok()
        .and_then(|exe| exe.parent().map(|dir| dir.join("build")));
    match next_to_exe.filter(|dir| dir.is_dir()) {
        Some(dir) => dir,
        None => PathBuf::from("build"),
    }
}

fn install_tracing(log_file: &Path) {
    let path = log_file.to_path_buf();
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::fmt::layer()
                .event_format(NodeLine)
                .with_ansi(false)
                .with_writer(move || LogFile { path: path.clone() })
                .with_filter(tracing_subscriber::filter::LevelFilter::INFO),
        )
        .init();
}

struct NodeLine;

impl<S, N> FormatEvent<S, N> for NodeLine
where
    S: Subscriber + for<'a> LookupSpan<'a>,
    N: for<'a> FormatFields<'a> + 'static,
{
    fn format_event(
        &self,
        ctx: &FmtContext<'_, S, N>,
        mut writer: Writer<'_>,
        event: &Event<'_>,
    ) -> std::fmt::Result {
        let stamp = Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true);
        write!(writer, "{stamp} ")?;
        ctx.field_format().format_fields(writer.by_ref(), event)?;
        writeln!(writer)
    }
}

struct LogFile {
    path: PathBuf,
}

impl Write for LogFile {
    fn write(&mut self, buffer: &[u8]) -> std::io::Result<usize> {
        let mut file = fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&self.path)?;
        file.write_all(buffer)?;
        Ok(buffer.len())
    }

    fn flush(&mut self) -> std::io::Result<()> {
        Ok(())
    }
}

fn log_line(path: &Path, line: &str) {
    let stamped = format!(
        "{} {line}",
        Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)
    );
    let written = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .and_then(|mut file| file.write_all(format!("{stamped}\n").as_bytes()));
    if written.is_err() {
        eprintln!("{stamped}");
    }
    if std::io::stdout().is_terminal() {
        println!("{line}");
    }
}

fn open_browser(url: &str) {
    let mut command = if cfg!(target_os = "windows") {
        let mut command = std::process::Command::new("cmd");
        command.args(["/c", "start", "", url]);
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x0800_0000;
            command.creation_flags(CREATE_NO_WINDOW);
        }
        command
    } else if cfg!(target_os = "macos") {
        let mut command = std::process::Command::new("open");
        command.arg(url);
        command
    } else {
        let mut command = std::process::Command::new("xdg-open");
        command.arg(url);
        command
    };

    if command
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .is_err()
    {
        eprintln!("{APP_NAME}: open {url} in a browser");
    }
}

async fn wait_for_signal() -> &'static str {
    #[cfg(unix)]
    {
        use tokio::signal::unix::{SignalKind, signal};

        match signal(SignalKind::terminate()) {
            Ok(mut terminate) => {
                tokio::select! {
                    _ = tokio::signal::ctrl_c() => "SIGINT",
                    _ = terminate.recv() => "SIGTERM",
                }
            }
            Err(_) => {
                let _ = tokio::signal::ctrl_c().await;
                "SIGINT"
            }
        }
    }
    #[cfg(not(unix))]
    {
        let _ = tokio::signal::ctrl_c().await;
        "SIGINT"
    }
}
