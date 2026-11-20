use schemars::JsonSchema;

use serde::{Deserialize, Serialize};
use xboct_log_core::{Comment, Entity, OpName, Result, TaskKey};

use crate::{Ctx, Kind, Op};

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct ListInput {
    pub task_id: TaskKey,
}

#[derive(Debug, Serialize, JsonSchema)]
pub struct CommentList {
    pub items: Vec<Comment>,
    pub total: usize,
}

pub struct CommentsList;

impl Op for CommentsList {
    const NAME: OpName = OpName::TasksCommentsList;
    const KIND: Kind = Kind::Query;
    const MCP: bool = true;
    const LAZY: bool = true;

    type Input = ListInput;
    type Output = CommentList;

    fn description() -> &'static str {
        crate::descriptions::COMMENTS_LIST
    }

    async fn run(ctx: &Ctx, input: Self::Input) -> Result<Self::Output> {
        let task_id = xboct_log_core::resolve_task_id(&ctx.db, input.task_id.as_str()).await?;
        let items = xboct_log_core::list_comments(&ctx.db, task_id.as_str()).await?;
        Ok(CommentList {
            total: items.len(),
            items,
        })
    }
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct AddInput {
    pub task_id: TaskKey,
    #[schemars(
        description = "Comment text as Markdown for the human reader of the task: what changed and why, in a few sentences. Markdown is rendered, so format it; a short log, config or command output is welcome in a fenced code block when it carries the point. Keep source code in the repository - name the file and describe the algorithm. A raw dump goes to an attachment, and walls of text stay out."
    )]
    pub body: String,
}

pub struct CommentsAdd;

impl Op for CommentsAdd {
    const NAME: OpName = OpName::TasksCommentsAdd;
    const KIND: Kind = Kind::Command;
    const MCP: bool = true;
    const LAZY: bool = true;

    type Input = AddInput;
    type Output = Comment;

    fn description() -> &'static str {
        crate::descriptions::COMMENTS_ADD
    }

    fn entity() -> Option<Entity> {
        Some(Entity::Comments)
    }

    async fn run(ctx: &Ctx, input: Self::Input) -> Result<Self::Output> {
        xboct_log_core::add_comment(&ctx.db, input.task_id.as_str(), &input.body).await
    }
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct EditInput {
    #[schemars(description = "The `id` of a comment from tasks_comments_list.")]
    pub comment_id: String,
    #[schemars(
        description = "Comment text as Markdown for the human reader of the task: what changed and why, in a few sentences. Markdown is rendered, so format it; a short log, config or command output is welcome in a fenced code block when it carries the point. Keep source code in the repository - name the file and describe the algorithm. A raw dump goes to an attachment, and walls of text stay out."
    )]
    pub body: String,
}

pub struct CommentsEdit;

impl Op for CommentsEdit {
    const NAME: OpName = OpName::TasksCommentsEdit;
    const KIND: Kind = Kind::Command;
    const MCP: bool = true;
    const LAZY: bool = true;

    type Input = EditInput;
    type Output = Comment;

    fn description() -> &'static str {
        crate::descriptions::COMMENTS_EDIT
    }

    fn entity() -> Option<Entity> {
        Some(Entity::Comments)
    }

    async fn run(ctx: &Ctx, input: Self::Input) -> Result<Self::Output> {
        xboct_log_core::edit_comment(&ctx.db, &input.comment_id, &input.body).await
    }
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct DeleteInput {
    #[schemars(description = "The `id` of a comment from tasks_comments_list.")]
    pub comment_id: String,
}

pub struct CommentsDelete;

impl Op for CommentsDelete {
    const NAME: OpName = OpName::TasksCommentsDelete;
    const KIND: Kind = Kind::Command;
    const MCP: bool = true;
    const LAZY: bool = true;

    type Input = DeleteInput;
    type Output = Comment;

    fn description() -> &'static str {
        crate::descriptions::COMMENTS_DELETE
    }

    fn entity() -> Option<Entity> {
        Some(Entity::Comments)
    }

    async fn run(ctx: &Ctx, input: Self::Input) -> Result<Self::Output> {
        xboct_log_core::delete_comment(&ctx.db, &input.comment_id).await
    }
}
