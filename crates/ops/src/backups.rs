use std::path::PathBuf;

use chrono::Local;
use serde::{Deserialize, Serialize};
use xboct_log_core::{
    BackupKind, RestoreOutcome, Result, SnapshotInfo, inspect_snapshot, list_backups,
    resolve_backup, restore_backup, run_backup,
};

use crate::{Ctx, Kind, descriptions};

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct EmptyInput {}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TargetInput {
    pub kind: BackupKind,
    pub name: String,
}

#[derive(Debug, Serialize)]
pub struct BackupCreated {
    pub path: PathBuf,
}

#[derive(Debug, Serialize)]
pub struct BackupList {
    pub items: Vec<xboct_log_core::BackupFile>,
}

pub struct BackupCreate;

impl crate::Op for BackupCreate {
    const NAME: &'static str = "backup_create";
    const KIND: Kind = Kind::Command;
    const MCP: bool = true;

    type Input = EmptyInput;
    type Output = BackupCreated;

    fn description() -> &'static str {
        descriptions::BACKUP_CREATE
    }

    async fn run(ctx: &Ctx, _input: EmptyInput) -> Result<BackupCreated> {
        let path = run_backup(
            &ctx.db,
            &ctx.config.backup_dir,
            &ctx.config.backup,
            BackupKind::Manual,
            Local::now(),
        )
        .await?;
        Ok(BackupCreated { path })
    }
}

pub struct BackupListOp;

impl crate::Op for BackupListOp {
    const NAME: &'static str = "backup_list";
    const KIND: Kind = Kind::Query;
    const MCP: bool = true;

    type Input = EmptyInput;
    type Output = BackupList;

    fn description() -> &'static str {
        descriptions::BACKUP_LIST
    }

    async fn run(ctx: &Ctx, _input: EmptyInput) -> Result<BackupList> {
        Ok(BackupList {
            items: list_backups(&ctx.config.backup_dir),
        })
    }
}

pub struct BackupsInspect;

impl crate::Op for BackupsInspect {
    const NAME: &'static str = "backups_inspect";
    const KIND: Kind = Kind::Command;
    const MCP: bool = false;

    type Input = TargetInput;
    type Output = SnapshotInfo;

    fn description() -> &'static str {
        descriptions::BACKUPS_INSPECT
    }

    async fn run(ctx: &Ctx, input: TargetInput) -> Result<SnapshotInfo> {
        let path = resolve_backup(&ctx.config.backup_dir, input.kind, &input.name)?;
        inspect_snapshot(&path).await
    }
}

pub struct BackupsRestore;

impl crate::Op for BackupsRestore {
    const NAME: &'static str = "backups_restore";
    const KIND: Kind = Kind::Command;
    const MCP: bool = false;

    type Input = TargetInput;
    type Output = RestoreOutcome;

    fn description() -> &'static str {
        descriptions::BACKUPS_RESTORE
    }

    async fn run(ctx: &Ctx, input: TargetInput) -> Result<RestoreOutcome> {
        let outcome = restore_backup(
            &ctx.db,
            &ctx.config.db_path,
            &ctx.config.backup_dir,
            input.kind,
            &input.name,
            Local::now(),
        )
        .await?;
        let events = ctx.events.clone();
        tokio::spawn(async move {
            tokio::time::sleep(std::time::Duration::from_millis(300)).await;
            events.publish_reset();
        });
        Ok(outcome)
    }
}
