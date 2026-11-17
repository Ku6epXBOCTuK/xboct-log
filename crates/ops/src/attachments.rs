use serde::{Deserialize, Serialize};
use xboct_log_core::{
    Attachment, AttachmentCheck, AttachmentId, DeletedAttachment, Entity, MovedAttachment, OpName,
    PurgedAttachment, TaskKey, add_attachment_from_base64, add_attachment_from_path,
    copy_attachment, delete_attachment, list_attachments, list_deleted_attachments,
    move_attachment, purge_attachment, resolve_task_id, restore_attachment, verify_attachments,
};

use crate::descriptions;
use crate::{Ctx, Kind, Op, Result};

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ListInput {
    pub task_id: TaskKey,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct OptionalTaskInput {
    #[serde(default)]
    pub task_id: Option<TaskKey>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AddInput {
    pub task_id: TaskKey,
    pub filename: String,
    #[serde(default)]
    pub path: Option<String>,
    #[serde(default)]
    pub content_base64: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AttachmentInput {
    pub attachment_id: AttachmentId,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct MoveInput {
    pub attachment_id: AttachmentId,
    pub task_id: TaskKey,
}

#[derive(Debug, Serialize)]
pub struct Items<Item> {
    pub items: Vec<Item>,
}

#[derive(Debug, Serialize)]
pub struct Created<Item> {
    pub item: Item,
}

pub struct AttachmentsList;

impl Op for AttachmentsList {
    const NAME: OpName = OpName::AttachmentsList;
    const KIND: Kind = Kind::Query;
    const MCP: bool = true;
    type Input = ListInput;
    type Output = Items<Attachment>;

    fn description() -> &'static str {
        descriptions::ATTACHMENTS_LIST
    }

    async fn run(ctx: &Ctx, input: Self::Input) -> Result<Self::Output> {
        let task_id = resolve_task_id(&ctx.db, input.task_id.as_str()).await?;
        let media = ctx.config.resolved_media_dir();
        let items = list_attachments(&ctx.db, &media, task_id.as_str()).await?;
        Ok(Items { items })
    }
}

pub struct AttachmentsDeletedList;

impl Op for AttachmentsDeletedList {
    const NAME: OpName = OpName::AttachmentsDeletedList;
    const KIND: Kind = Kind::Query;
    const MCP: bool = true;
    type Input = OptionalTaskInput;
    type Output = Items<DeletedAttachment>;

    fn description() -> &'static str {
        descriptions::ATTACHMENTS_DELETED_LIST
    }

    async fn run(ctx: &Ctx, input: Self::Input) -> Result<Self::Output> {
        let task_id = match &input.task_id {
            Some(task_id) => Some(resolve_task_id(&ctx.db, task_id.as_str()).await?),
            None => None,
        };
        let media = ctx.config.resolved_media_dir();
        let items =
            list_deleted_attachments(&ctx.db, &media, task_id.as_ref().map(TaskKey::as_str))
                .await?;
        Ok(Items { items })
    }
}

pub struct AttachmentsAdd;

impl Op for AttachmentsAdd {
    const NAME: OpName = OpName::AttachmentsAdd;
    const KIND: Kind = Kind::Command;
    const MCP: bool = true;
    type Input = AddInput;
    type Output = Created<Attachment>;

    fn description() -> &'static str {
        descriptions::ATTACHMENTS_ADD
    }

    fn entity() -> Option<Entity> {
        Some(Entity::Tasks)
    }

    async fn run(ctx: &Ctx, input: Self::Input) -> Result<Self::Output> {
        let task_id = resolve_task_id(&ctx.db, input.task_id.as_str()).await?;
        let media = ctx.config.resolved_media_dir();
        let item = match (&input.path, &input.content_base64) {
            (Some(path), _) => {
                add_attachment_from_path(&ctx.db, &media, task_id.as_str(), path).await?
            }
            (None, Some(content)) => {
                add_attachment_from_base64(
                    &ctx.db,
                    &media,
                    task_id.as_str(),
                    &input.filename,
                    content,
                )
                .await?
            }
            (None, None) => {
                return Err(xboct_log_core::AppError::validation(
                    "give either path or content_base64",
                ));
            }
        };
        Ok(Created { item })
    }
}

pub struct AttachmentsDelete;

impl Op for AttachmentsDelete {
    const NAME: OpName = OpName::AttachmentsDelete;
    const KIND: Kind = Kind::Command;
    const MCP: bool = true;
    type Input = AttachmentInput;
    type Output = Attachment;

    fn description() -> &'static str {
        descriptions::ATTACHMENTS_DELETE
    }

    fn entity() -> Option<Entity> {
        Some(Entity::Tasks)
    }

    async fn run(ctx: &Ctx, input: Self::Input) -> Result<Self::Output> {
        delete_attachment(&ctx.db, input.attachment_id.as_str()).await
    }
}

pub struct AttachmentsRestore;

impl Op for AttachmentsRestore {
    const NAME: OpName = OpName::AttachmentsRestore;
    const KIND: Kind = Kind::Command;
    const MCP: bool = true;
    type Input = AttachmentInput;
    type Output = Attachment;

    fn description() -> &'static str {
        descriptions::ATTACHMENTS_RESTORE
    }

    fn entity() -> Option<Entity> {
        Some(Entity::Tasks)
    }

    async fn run(ctx: &Ctx, input: Self::Input) -> Result<Self::Output> {
        let media = ctx.config.resolved_media_dir();
        restore_attachment(&ctx.db, &media, input.attachment_id.as_str()).await
    }
}

pub struct AttachmentsMove;

impl Op for AttachmentsMove {
    const NAME: OpName = OpName::AttachmentsMove;
    const KIND: Kind = Kind::Command;
    const MCP: bool = true;
    type Input = MoveInput;
    type Output = MovedAttachment;

    fn description() -> &'static str {
        descriptions::ATTACHMENTS_MOVE
    }

    fn entity() -> Option<Entity> {
        Some(Entity::Tasks)
    }

    async fn run(ctx: &Ctx, input: Self::Input) -> Result<Self::Output> {
        let target = resolve_task_id(&ctx.db, input.task_id.as_str()).await?;
        let media = ctx.config.resolved_media_dir();
        move_attachment(
            &ctx.db,
            &media,
            input.attachment_id.as_str(),
            target.as_str(),
        )
        .await
    }
}

pub struct AttachmentsCopy;

impl Op for AttachmentsCopy {
    const NAME: OpName = OpName::AttachmentsCopy;
    const KIND: Kind = Kind::Command;
    const MCP: bool = true;
    type Input = MoveInput;
    type Output = Created<Attachment>;

    fn description() -> &'static str {
        descriptions::ATTACHMENTS_COPY
    }

    fn entity() -> Option<Entity> {
        Some(Entity::Tasks)
    }

    async fn run(ctx: &Ctx, input: Self::Input) -> Result<Self::Output> {
        let target = resolve_task_id(&ctx.db, input.task_id.as_str()).await?;
        let media = ctx.config.resolved_media_dir();
        let item = copy_attachment(
            &ctx.db,
            &media,
            input.attachment_id.as_str(),
            target.as_str(),
        )
        .await?;
        Ok(Created { item })
    }
}

pub struct AttachmentsPurge;

impl Op for AttachmentsPurge {
    const NAME: OpName = OpName::AttachmentsPurge;
    const KIND: Kind = Kind::Command;
    const MCP: bool = true;
    type Input = AttachmentInput;
    type Output = PurgedAttachment;

    fn description() -> &'static str {
        descriptions::ATTACHMENTS_PURGE
    }

    fn entity() -> Option<Entity> {
        Some(Entity::Tasks)
    }

    async fn run(ctx: &Ctx, input: Self::Input) -> Result<Self::Output> {
        let media = ctx.config.resolved_media_dir();
        purge_attachment(&ctx.db, &media, input.attachment_id.as_str()).await
    }
}

pub struct AttachmentsVerify;

impl Op for AttachmentsVerify {
    const NAME: OpName = OpName::AttachmentsVerify;
    const KIND: Kind = Kind::Query;
    const MCP: bool = true;
    type Input = OptionalTaskInput;
    type Output = AttachmentCheck;

    fn description() -> &'static str {
        descriptions::ATTACHMENTS_VERIFY
    }

    async fn run(ctx: &Ctx, input: Self::Input) -> Result<Self::Output> {
        let task_id = match &input.task_id {
            Some(task_id) => Some(resolve_task_id(&ctx.db, task_id.as_str()).await?),
            None => None,
        };
        let media = ctx.config.resolved_media_dir();
        verify_attachments(&ctx.db, &media, task_id.as_ref().map(TaskKey::as_str)).await
    }
}
