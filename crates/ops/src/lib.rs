#![forbid(unsafe_code)]

use std::{future::Future, sync::Arc};

use chrono::Local;
use serde::{Deserialize, Serialize, de::DeserializeOwned};
use xboct_log_core::{
    ActivitySource, AutoBackup, Config, Db, Entity, Events, Result, maybe_auto_backup,
    record_activity,
};

pub mod activity;
pub mod attachments;
pub mod backups;
pub mod comments;
mod descriptions;
mod entries;
pub mod projects;
pub mod scopes;
pub mod tags;
pub mod tasks;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Kind {
    Query,
    Command,
}

#[derive(Debug, Clone)]
pub struct OpInfo {
    pub name: &'static str,
    pub kind: Kind,
    pub mcp: bool,
    pub description: &'static str,
    pub entity: Option<Entity>,
}

pub struct Ctx {
    pub db: Arc<Db>,
    pub events: Arc<Events>,
    pub config: Arc<Config>,
    pub auto_backup: Arc<AutoBackup>,
    pub source: ActivitySource,
    pub client: Option<String>,
}

impl Ctx {
    pub fn new(db: Arc<Db>, events: Arc<Events>, config: Arc<Config>) -> Self {
        Self {
            db,
            events,
            config,
            auto_backup: Arc::new(AutoBackup::new()),
            source: ActivitySource::Ui,
            client: None,
        }
    }

    pub fn with_source(mut self, source: ActivitySource) -> Self {
        self.source = source;
        self
    }

    pub fn with_client(mut self, client: Option<String>) -> Self {
        self.client = client;
        self
    }
}

pub trait Op {
    const NAME: &'static str;
    const KIND: Kind;
    const MCP: bool;

    type Input: DeserializeOwned + Send;
    type Output: Serialize + Send;

    fn description() -> &'static str;

    fn entity() -> Option<Entity> {
        None
    }

    fn run(ctx: &Ctx, input: Self::Input) -> impl Future<Output = Result<Self::Output>> + Send;
}

async fn execute<O: Op>(
    ctx: &Ctx,
    input: O::Input,
    raw: serde_json::Value,
) -> Result<serde_json::Value> {
    if O::KIND == Kind::Command && ctx.source == ActivitySource::Mcp {
        maybe_auto_backup(
            &ctx.db,
            &ctx.config.backup_dir,
            &ctx.config.backup,
            &ctx.auto_backup,
            Local::now(),
        )
        .await?;
    }

    let output = O::run(ctx, input).await?;
    let value = serde_json::to_value(output)
        .map_err(|error| xboct_log_core::AppError::unexpected(error.to_string()))?;

    if O::KIND == Kind::Command {
        if let Some(entity) = O::entity() {
            ctx.events
                .publish_change(entity, O::NAME, ctx.source, ctx.client.clone());
        }
        let entries = entries::entries(O::NAME, &raw, &value);
        if !entries.is_empty() {
            record_activity(
                &ctx.db,
                ctx.source,
                O::NAME,
                &entries,
                ctx.client.as_deref(),
                Local::now(),
            )
            .await?;
        }
    }
    Ok(value)
}

#[macro_export]
macro_rules! ops {
	($($op:ty),+ $(,)?) => {
		pub fn metadata() -> ::std::vec::Vec<$crate::OpInfo> {
			::std::vec![
				$($crate::OpInfo {
					name: <$op as $crate::Op>::NAME,
					kind: <$op as $crate::Op>::KIND,
					mcp: <$op as $crate::Op>::MCP,
					description: <$op as $crate::Op>::description(),
					entity: <$op as $crate::Op>::entity(),
				}),+
			]
		}

		pub async fn dispatch(
			ctx: &$crate::Ctx,
			name: &str,
			input: ::serde_json::Value,
		) -> ::xboct_log_core::Result<::serde_json::Value> {
			match name {
				$(<$op as $crate::Op>::NAME => {
					let parsed = ::serde_json::from_value::<<$op as $crate::Op>::Input>(input.clone())
						.map_err(|error| ::xboct_log_core::AppError::validation(error.to_string()))?;
					$crate::execute::<$op>(ctx, parsed, input).await
				}),+,
				_ => ::std::result::Result::Err(
					::xboct_log_core::AppError::not_found(format!("no operation named {name}")),
				),
			}
		}
	};
}

pub use activity::{ActivitiesList, TasksHistory};
pub use attachments::{
    AttachmentsAdd, AttachmentsCopy, AttachmentsDelete, AttachmentsDeletedList, AttachmentsList,
    AttachmentsMove, AttachmentsPurge, AttachmentsRestore, AttachmentsVerify,
};
pub use backups::{BackupCreate, BackupListOp, BackupsInspect, BackupsRestore};
pub use comments::{CommentsAdd, CommentsDelete, CommentsEdit, CommentsList};
pub use projects::{ProjectsCreate, ProjectsGet, ProjectsList, ProjectsUpdate};
pub use scopes::{
    ScopesCreate, ScopesDelete, ScopesGet, ScopesList, ScopesProjectIds, ScopesUpdate,
};
pub use tags::{TagsCreate, TagsDictionary, TagsInventory, TagsList, TagsRename, TagsUpdate};
pub use tasks::{
    TasksAddBlocker, TasksAddLink, TasksClose, TasksCloseMany, TasksCreate, TasksCreateMany,
    TasksDelete, TasksDeletedList, TasksGet, TasksGetMany, TasksList, TasksMove, TasksOptions,
    TasksRemoveBlocker, TasksRemoveLink, TasksRestore, TasksRevisionsList, TasksStats, TasksUpdate,
    TasksUpdateMany,
};

crate::ops![
    TasksHistory,
    ActivitiesList,
    AttachmentsList,
    AttachmentsDeletedList,
    AttachmentsAdd,
    AttachmentsDelete,
    AttachmentsRestore,
    AttachmentsMove,
    AttachmentsCopy,
    AttachmentsPurge,
    AttachmentsVerify,
    BackupCreate,
    BackupListOp,
    BackupsInspect,
    BackupsRestore,
    TasksAddBlocker,
    TasksRemoveBlocker,
    TasksAddLink,
    TasksRemoveLink,
    CommentsList,
    CommentsAdd,
    CommentsEdit,
    CommentsDelete,
    TasksOptions,
    ProjectsList,
    ProjectsGet,
    ProjectsCreate,
    ProjectsUpdate,
    TasksRevisionsList,
    ScopesList,
    ScopesGet,
    ScopesProjectIds,
    ScopesCreate,
    ScopesUpdate,
    ScopesDelete,
    TasksStats,
    TasksList,
    TasksDeletedList,
    TasksGetMany,
    TasksGet,
    TasksCreate,
    TasksCreateMany,
    TasksUpdate,
    TasksUpdateMany,
    TasksClose,
    TasksCloseMany,
    TasksDelete,
    TasksRestore,
    TasksMove,
    TagsList,
    TagsDictionary,
    TagsInventory,
    TagsCreate,
    TagsUpdate,
    TagsRename,
];
