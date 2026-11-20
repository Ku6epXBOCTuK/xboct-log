#![forbid(unsafe_code)]

use std::{future::Future, sync::Arc};

use chrono::Local;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize, de::DeserializeOwned};
use xboct_log_core::{
    ActivitySource, AutoBackup, Config, Db, Entity, Events, OpName, Result, maybe_auto_backup,
    record_activity,
};

pub mod activity;
pub mod attachments;
pub mod backups;
pub mod comments;
mod descriptions;
pub mod documents;
mod entries;
pub mod plans;
pub mod projects;
pub mod request_log;
pub mod scopes;
pub mod tags;
pub mod tasks;

pub fn schema_of<T: JsonSchema>() -> serde_json::Value {
    serde_json::to_value(schemars::schema_for!(T)).unwrap_or(serde_json::Value::Null)
}

pub fn patch_fields(name: &str) -> &'static [&'static str] {
    match name {
        "projects_update" => &["name", "archived", "repo"],
        "scopes_update" => &["name"],
        "plans_update" => &["name", "description", "status"],
        "documents_update" => &["kind", "title", "body", "status", "source_file"],
        "tags_update" => &["archived"],
        "tasks_update" => &[
            "title",
            "description",
            "status",
            "priority",
            "is_epic",
            "epic_id",
            "scope_id",
            "scope",
            "source_file",
            "tags",
            "estimate",
            "assignee",
            "due_at",
            "blocked_reason",
        ],
        _ => &[],
    }
}

#[derive(Debug, Default, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(default, deny_unknown_fields)]
pub struct EmptyInput {}

#[derive(Debug, Serialize, JsonSchema)]
pub struct Items<T> {
    pub items: Vec<T>,
}

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
    const NAME: OpName;
    const KIND: Kind;
    const MCP: bool;

    type Input: DeserializeOwned + Send + JsonSchema;
    type Output: Serialize + Send + JsonSchema;

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
                .publish_change(entity, O::NAME.as_str(), ctx.source, ctx.client.clone());
        }
        let entries = entries::entries(O::NAME.as_str(), &raw, &value);
        if !entries.is_empty() {
            record_activity(
                &ctx.db,
                ctx.source,
                O::NAME.as_str(),
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
					name: <$op as $crate::Op>::NAME.as_str(),
					kind: <$op as $crate::Op>::KIND,
					mcp: <$op as $crate::Op>::MCP,
					description: <$op as $crate::Op>::description(),
					entity: <$op as $crate::Op>::entity(),
				}),+
			]
		}

		pub fn operation_schema(
			name: &str,
		) -> ::std::option::Option<(
			&'static str,
			::serde_json::Value,
			::serde_json::Value,
		)> {
			$(
				if name == <$op as $crate::Op>::NAME.as_str() {
					return ::std::option::Option::Some((
						<$op as $crate::Op>::NAME.as_str(),
						$crate::schema_of::<<$op as $crate::Op>::Input>(),
						$crate::schema_of::<<$op as $crate::Op>::Output>(),
					));
				}
			)+
			::std::option::Option::None
		}

		pub fn tool_schema(
			name: &str,
		) -> ::std::option::Option<(::serde_json::Value, ::serde_json::Value)> {
			$(
				if <$op as $crate::Op>::MCP && name == <$op as $crate::Op>::NAME.as_str() {
					return ::std::option::Option::Some((
						$crate::schema_of::<<$op as $crate::Op>::Input>(),
						$crate::schema_of::<<$op as $crate::Op>::Output>(),
					));
				}
			)+
			::std::option::Option::None
		}

		pub async fn dispatch(
			ctx: &$crate::Ctx,
			name: &str,
			input: ::serde_json::Value,
		) -> ::xboct_log_core::Result<::serde_json::Value> {
			$(
				if name == <$op as $crate::Op>::NAME.as_str() {
					let parsed = ::serde_json::from_value::<<$op as $crate::Op>::Input>(input.clone())
						.map_err(|error| ::xboct_log_core::AppError::validation(error.to_string()))?;
					return $crate::execute::<$op>(ctx, parsed, input).await;
				}
			)+
			::std::result::Result::Err(
				::xboct_log_core::AppError::not_found(format!("no operation named {name}")),
			)
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
pub use documents::{
    DocumentsCreate, DocumentsDelete, DocumentsDeletedList, DocumentsGet, DocumentsList,
    DocumentsRestore, DocumentsRevisionsList, DocumentsUpdate, PlansDocumentsLink,
    PlansDocumentsList, PlansDocumentsUnlink,
};
pub use plans::{
    PlansCreate, PlansDelete, PlansDeletedList, PlansGet, PlansItemsAdd, PlansItemsRemove,
    PlansList, PlansListInput, PlansNotesAdd, PlansNotesDelete, PlansNotesDeletedList,
    PlansNotesEdit, PlansNotesList, PlansNotesRestore, PlansNotesRevisionsList, PlansReorder,
    PlansRestore, PlansUpdate,
};
pub use projects::{ProjectsCreate, ProjectsGet, ProjectsList, ProjectsUpdate};
pub use request_log::{RequestLogExport, RequestLogList};
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
    RequestLogList,
    RequestLogExport,
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
    PlansList,
    PlansGet,
    PlansCreate,
    PlansUpdate,
    PlansDelete,
    PlansRestore,
    PlansDeletedList,
    PlansItemsAdd,
    PlansItemsRemove,
    PlansReorder,
    PlansNotesList,
    PlansNotesAdd,
    PlansNotesEdit,
    PlansNotesDelete,
    PlansNotesRestore,
    PlansNotesDeletedList,
    PlansNotesRevisionsList,
    DocumentsList,
    DocumentsGet,
    DocumentsCreate,
    DocumentsUpdate,
    DocumentsDelete,
    DocumentsRestore,
    DocumentsDeletedList,
    DocumentsRevisionsList,
    PlansDocumentsList,
    PlansDocumentsLink,
    PlansDocumentsUnlink,
];
