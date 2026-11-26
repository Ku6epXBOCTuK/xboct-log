use super::*;

pub(super) fn parse_restore(
    args: &[String],
    env_port: Option<&str>,
    env_data: Option<&str>,
) -> Result<Invocation, String> {
    let db = env_value("XBOCT_LOG_DB");
    let backups = env_value("XBOCT_LOG_BACKUP_DIR");
    let argv = with_defaults(
        args,
        &[
            ("--port", env_port),
            ("--data", env_data),
            ("--db", db.as_deref()),
            ("--backups", backups.as_deref()),
        ],
    );
    let cli = match read(argv) {
        Ok(cli) => cli,
        Err(error) => return error.into_result(),
    };
    let Some(Command::Restore(restore)) = cli.command else {
        return Err("restore needs a command".to_string());
    };
    let action = match restore.action {
        None | Some(RestoreCommand::List) => RestoreAction::List,
        Some(RestoreCommand::Apply { source }) => RestoreAction::Apply { source },
    };

    Ok(Invocation::Restore(Restore {
        action,
        data: restore.data,
        db: restore.db,
        backups: restore.backups,
        port: restore.port,
    }))
}
