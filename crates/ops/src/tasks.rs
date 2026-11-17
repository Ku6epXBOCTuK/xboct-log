use serde::Deserialize;
use serde_json::{Value, json};
use xboct_log_core::{
    AppError, ClosedReason, Entity, NewTask, OpName, ProjectId, Result, TaskKey, TaskList,
    TaskPatch, close_task, close_task_detailed, count_epic_children_by_status, create_task,
    get_task, list_tasks, update_task, warnings_for,
};

use crate::{Ctx, Kind, Op};

pub struct TasksList;

impl Op for TasksList {
    const NAME: OpName = OpName::TasksList;
    const KIND: Kind = Kind::Query;
    const MCP: bool = true;

    type Input = xboct_log_core::TaskFilters;
    type Output = TaskList;

    fn description() -> &'static str {
        crate::descriptions::TASKS_LIST
    }

    async fn run(ctx: &Ctx, input: Self::Input) -> Result<Self::Output> {
        list_tasks(&ctx.db, &input).await
    }
}

pub struct TasksGet;

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct GetInput {
    pub task_id: TaskKey,
}

impl Op for TasksGet {
    const NAME: OpName = OpName::TasksGet;
    const KIND: Kind = Kind::Query;
    const MCP: bool = true;

    type Input = GetInput;
    type Output = Value;

    fn description() -> &'static str {
        crate::descriptions::TASKS_GET
    }

    fn entity() -> Option<Entity> {
        None
    }

    async fn run(ctx: &Ctx, input: Self::Input) -> Result<Self::Output> {
        let task = get_task(&ctx.db, input.task_id.as_str()).await?;
        let epic = task.is_epic;
        let key = task.id.clone();
        let mut value =
            serde_json::to_value(task).map_err(|error| AppError::unexpected(error.to_string()))?;
        if epic {
            let counts = count_epic_children_by_status(&ctx.db, key.as_str()).await?;
            if let Value::Object(object) = &mut value {
                object.insert("children_counts".to_string(), json!(counts));
            }
        }
        Ok(value)
    }
}

pub struct TasksCreate;

impl Op for TasksCreate {
    const NAME: OpName = OpName::TasksCreate;
    const KIND: Kind = Kind::Command;
    const MCP: bool = true;

    type Input = NewTask;
    type Output = Value;

    fn description() -> &'static str {
        crate::descriptions::TASKS_CREATE
    }

    fn entity() -> Option<Entity> {
        Some(Entity::Tasks)
    }

    async fn run(ctx: &Ctx, input: Self::Input) -> Result<Self::Output> {
        create_task(&ctx.db, input).await
    }
}

pub struct TasksUpdate;

#[derive(Debug, Deserialize)]
pub struct UpdateInput {
    pub task_id: TaskKey,
    #[serde(default)]
    pub patch: Option<Value>,
    #[serde(flatten)]
    pub flat: TaskPatch,
}

impl Op for TasksUpdate {
    const NAME: OpName = OpName::TasksUpdate;
    const KIND: Kind = Kind::Command;
    const MCP: bool = true;

    type Input = UpdateInput;
    type Output = Value;

    fn description() -> &'static str {
        crate::descriptions::TASKS_UPDATE
    }

    fn entity() -> Option<Entity> {
        Some(Entity::Tasks)
    }

    async fn run(ctx: &Ctx, input: Self::Input) -> Result<Self::Output> {
        let patch = match input.patch {
            Some(value) => serde_json::from_value(value)
                .map_err(|error| AppError::validation(error.to_string()))?,
            None => input.flat,
        };
        update_task(&ctx.db, input.task_id.as_str(), patch).await
    }
}

pub struct TasksClose;

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CloseInput {
    pub task_id: TaskKey,
    pub reason: ClosedReason,
}

impl Op for TasksClose {
    const NAME: OpName = OpName::TasksClose;
    const KIND: Kind = Kind::Command;
    const MCP: bool = true;

    type Input = CloseInput;
    type Output = Value;

    fn description() -> &'static str {
        crate::descriptions::TASKS_CLOSE
    }

    fn entity() -> Option<Entity> {
        Some(Entity::Tasks)
    }

    async fn run(ctx: &Ctx, input: Self::Input) -> Result<Self::Output> {
        close_task(&ctx.db, input.task_id.as_str(), input.reason).await
    }
}

fn summary(items: Vec<Value>) -> Value {
    let succeeded = items
        .iter()
        .filter(|item| item.get("ok") == Some(&Value::Bool(true)))
        .count() as i64;
    let failed = items.len() as i64 - succeeded;
    json!({ "items": items, "succeeded": succeeded, "failed": failed })
}

fn validate_items(count: usize) -> Result<()> {
    if (1..=100).contains(&count) {
        Ok(())
    } else {
        Err(AppError::validation(
            "items must contain between 1 and 100 entries",
        ))
    }
}

fn batch_error(index: usize, id: Option<&str>, error: &AppError) -> Value {
    json!({
        "index": index,
        "id": id,
        "ok": false,
        "error": { "kind": error.kind(), "message": error.message() },
    })
}

fn update_item(
    index: usize,
    id: &str,
    outcome: xboct_log_core::tasks::UpdateOutcome,
    warnings: Vec<String>,
) -> Value {
    let mut item = json!({
        "index": index,
        "id": id,
        "ok": true,
        "task": outcome.task,
        "changes": outcome.changes,
        "released": outcome.released,
        "warnings": warnings,
    });
    if let Value::Object(object) = &mut item {
        if let Some(epic) = outcome.closed_epic {
            object.insert("closed_epic".to_string(), json!(epic));
        }
        if let Some(epic) = outcome.reopened_epic {
            object.insert("reopened_epic".to_string(), json!(epic));
        }
    }
    item
}

pub struct TasksDelete;

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DeleteInput {
    pub task_id: TaskKey,
}

impl Op for TasksDelete {
    const NAME: OpName = OpName::TasksDelete;
    const KIND: Kind = Kind::Command;
    const MCP: bool = true;

    type Input = DeleteInput;
    type Output = Value;

    fn description() -> &'static str {
        crate::descriptions::TASKS_DELETE
    }

    fn entity() -> Option<Entity> {
        Some(Entity::Tasks)
    }

    async fn run(ctx: &Ctx, input: Self::Input) -> Result<Self::Output> {
        xboct_log_core::delete_task(&ctx.db, input.task_id.as_str()).await
    }
}

pub struct TasksRestore;

impl Op for TasksRestore {
    const NAME: OpName = OpName::TasksRestore;
    const KIND: Kind = Kind::Command;
    const MCP: bool = true;

    type Input = DeleteInput;
    type Output = Value;

    fn description() -> &'static str {
        crate::descriptions::TASKS_RESTORE
    }

    fn entity() -> Option<Entity> {
        Some(Entity::Tasks)
    }

    async fn run(ctx: &Ctx, input: Self::Input) -> Result<Self::Output> {
        let task = xboct_log_core::restore_task(&ctx.db, input.task_id.as_str()).await?;
        Ok(serde_json::to_value(task)?)
    }
}

pub struct TasksMove;

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct MoveInput {
    pub task_id: TaskKey,
    pub project_id: ProjectId,
}

impl Op for TasksMove {
    const NAME: OpName = OpName::TasksMove;
    const KIND: Kind = Kind::Command;
    const MCP: bool = true;

    type Input = MoveInput;
    type Output = Value;

    fn description() -> &'static str {
        crate::descriptions::TASKS_MOVE
    }

    fn entity() -> Option<Entity> {
        Some(Entity::Tasks)
    }

    async fn run(ctx: &Ctx, input: Self::Input) -> Result<Self::Output> {
        let task =
            xboct_log_core::move_task(&ctx.db, input.task_id.as_str(), input.project_id.as_str())
                .await?;
        Ok(serde_json::to_value(task)?)
    }
}

pub struct TasksCreateMany;

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CreateManyInput {
    pub items: Vec<NewTask>,
}

impl Op for TasksCreateMany {
    const NAME: OpName = OpName::TasksCreateMany;
    const KIND: Kind = Kind::Command;
    const MCP: bool = true;

    type Input = CreateManyInput;
    type Output = Value;

    fn description() -> &'static str {
        crate::descriptions::TASKS_CREATE_MANY
    }

    fn entity() -> Option<Entity> {
        Some(Entity::Tasks)
    }

    async fn run(ctx: &Ctx, input: Self::Input) -> Result<Self::Output> {
        validate_items(input.items.len())?;
        let mut items = Vec::with_capacity(input.items.len());
        for (index, task) in input.items.into_iter().enumerate() {
            match create_task(&ctx.db, task).await {
                Ok(value) => {
                    let mut value = value;
                    let warnings = match &mut value {
                        Value::Object(object) => {
                            object.remove("warnings").unwrap_or_else(|| json!([]))
                        }
                        _ => json!([]),
                    };
                    items.push(json!({
                        "index": index,
                        "id": value.get("id").cloned().unwrap_or(Value::Null),
                        "ok": true,
                        "task": value,
                        "changes": [],
                        "released": [],
                        "warnings": warnings,
                    }));
                }
                Err(error) => items.push(batch_error(index, None, &error)),
            }
        }
        Ok(summary(items))
    }
}

pub struct TasksUpdateMany;

#[derive(Debug, Deserialize)]
pub struct UpdateManyInput {
    pub items: Vec<UpdateInput>,
}

impl Op for TasksUpdateMany {
    const NAME: OpName = OpName::TasksUpdateMany;
    const KIND: Kind = Kind::Command;
    const MCP: bool = true;

    type Input = UpdateManyInput;
    type Output = Value;

    fn description() -> &'static str {
        crate::descriptions::TASKS_UPDATE_MANY
    }

    fn entity() -> Option<Entity> {
        Some(Entity::Tasks)
    }

    async fn run(ctx: &Ctx, input: Self::Input) -> Result<Self::Output> {
        validate_items(input.items.len())?;
        let mut items = Vec::with_capacity(input.items.len());
        for (index, item) in input.items.into_iter().enumerate() {
            let id = item.task_id.to_string();
            let patch = match item.patch {
                Some(value) => serde_json::from_value::<TaskPatch>(value)
                    .map_err(|error| AppError::validation(error.to_string())),
                None => Ok(item.flat),
            };
            let result = match patch {
                Ok(patch) => {
                    xboct_log_core::update_task_detailed(&ctx.db, item.task_id.as_str(), patch)
                        .await
                }
                Err(error) => Err(error),
            };
            match result {
                Ok(outcome) => {
                    let warnings = warnings_for(&ctx.db, &outcome.task).await?;
                    items.push(update_item(index, &id, outcome, warnings));
                }
                Err(error) => items.push(batch_error(index, Some(&id), &error)),
            }
        }
        Ok(summary(items))
    }
}

pub struct TasksCloseMany;

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CloseManyInput {
    pub items: Vec<CloseInput>,
}

impl Op for TasksCloseMany {
    const NAME: OpName = OpName::TasksCloseMany;
    const KIND: Kind = Kind::Command;
    const MCP: bool = true;

    type Input = CloseManyInput;
    type Output = Value;

    fn description() -> &'static str {
        crate::descriptions::TASKS_CLOSE_MANY
    }

    fn entity() -> Option<Entity> {
        Some(Entity::Tasks)
    }

    async fn run(ctx: &Ctx, input: Self::Input) -> Result<Self::Output> {
        validate_items(input.items.len())?;
        let mut items = Vec::with_capacity(input.items.len());
        for (index, item) in input.items.into_iter().enumerate() {
            let id = item.task_id.to_string();
            match close_task_detailed(&ctx.db, item.task_id.as_str(), item.reason).await {
                Ok(outcome) => {
                    let warnings = warnings_for(&ctx.db, &outcome.task).await?;
                    items.push(update_item(index, &id, outcome, warnings));
                }
                Err(error) => items.push(batch_error(index, Some(&id), &error)),
            }
        }
        Ok(summary(items))
    }
}

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LinkKindInput {
    RelatesTo,
    Duplicates,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct LinkInput {
    pub task_id: TaskKey,
    pub link_type: LinkKindInput,
    pub target: TaskKey,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct BlockerInput {
    pub task_id: TaskKey,
    pub blocked_by: TaskKey,
}

fn linked_output(task: xboct_log_core::Task, changes: Vec<Value>) -> Result<Value> {
    let mut value = serde_json::to_value(task)?;
    if let Value::Object(object) = &mut value {
        object.insert("changes".to_string(), json!(changes));
    }
    Ok(value)
}

pub struct TasksAddLink;

impl Op for TasksAddLink {
    const NAME: OpName = OpName::TasksAddLink;
    const KIND: Kind = Kind::Command;
    const MCP: bool = true;

    type Input = LinkInput;
    type Output = Value;

    fn description() -> &'static str {
        crate::descriptions::TASKS_ADD_LINK
    }

    fn entity() -> Option<Entity> {
        Some(Entity::Tasks)
    }

    async fn run(ctx: &Ctx, input: Self::Input) -> Result<Self::Output> {
        let before = get_task(&ctx.db, input.task_id.as_str()).await?;
        let (kind, field) = match input.link_type {
            LinkKindInput::RelatesTo => (xboct_log_core::LinkType::RelatesTo, "relates_to"),
            LinkKindInput::Duplicates => (xboct_log_core::LinkType::Duplicates, "duplicates"),
        };
        xboct_log_core::add_link(&ctx.db, kind, input.task_id.as_str(), input.target.as_str())
            .await?;
        let after = get_task(&ctx.db, input.task_id.as_str()).await?;
        let changes = xboct_log_core::link_changes(&before, &after, field);
        linked_output(after, changes)
    }
}

pub struct TasksRemoveLink;

impl Op for TasksRemoveLink {
    const NAME: OpName = OpName::TasksRemoveLink;
    const KIND: Kind = Kind::Command;
    const MCP: bool = true;

    type Input = LinkInput;
    type Output = Value;

    fn description() -> &'static str {
        crate::descriptions::TASKS_REMOVE_LINK
    }

    fn entity() -> Option<Entity> {
        Some(Entity::Tasks)
    }

    async fn run(ctx: &Ctx, input: Self::Input) -> Result<Self::Output> {
        let before = get_task(&ctx.db, input.task_id.as_str()).await?;
        let (kind, field) = match input.link_type {
            LinkKindInput::RelatesTo => (xboct_log_core::LinkType::RelatesTo, "relates_to"),
            LinkKindInput::Duplicates => (xboct_log_core::LinkType::Duplicates, "duplicates"),
        };
        xboct_log_core::remove_link(&ctx.db, kind, input.task_id.as_str(), input.target.as_str())
            .await?;
        let after = get_task(&ctx.db, input.task_id.as_str()).await?;
        let changes = xboct_log_core::link_changes(&before, &after, field);
        linked_output(after, changes)
    }
}

pub struct TasksAddBlocker;

impl Op for TasksAddBlocker {
    const NAME: OpName = OpName::TasksAddBlocker;
    const KIND: Kind = Kind::Command;
    const MCP: bool = true;

    type Input = BlockerInput;
    type Output = Value;

    fn description() -> &'static str {
        crate::descriptions::TASKS_ADD_BLOCKER
    }

    fn entity() -> Option<Entity> {
        Some(Entity::Tasks)
    }

    async fn run(ctx: &Ctx, input: Self::Input) -> Result<Self::Output> {
        let before = get_task(&ctx.db, input.task_id.as_str()).await?;
        xboct_log_core::add_blocker(&ctx.db, input.task_id.as_str(), input.blocked_by.as_str())
            .await?;
        let after = get_task(&ctx.db, input.task_id.as_str()).await?;
        let changes = xboct_log_core::link_changes(&before, &after, "blocked_by");
        linked_output(after, changes)
    }
}

pub struct TasksRemoveBlocker;

impl Op for TasksRemoveBlocker {
    const NAME: OpName = OpName::TasksRemoveBlocker;
    const KIND: Kind = Kind::Command;
    const MCP: bool = true;

    type Input = BlockerInput;
    type Output = Value;

    fn description() -> &'static str {
        crate::descriptions::TASKS_REMOVE_BLOCKER
    }

    fn entity() -> Option<Entity> {
        Some(Entity::Tasks)
    }

    async fn run(ctx: &Ctx, input: Self::Input) -> Result<Self::Output> {
        let before = get_task(&ctx.db, input.task_id.as_str()).await?;
        xboct_log_core::remove_blocker(&ctx.db, input.task_id.as_str(), input.blocked_by.as_str())
            .await?;
        let after = get_task(&ctx.db, input.task_id.as_str()).await?;
        let changes = xboct_log_core::link_changes(&before, &after, "blocked_by");
        linked_output(after, changes)
    }
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct OptionsInput {
    #[serde(default)]
    project_id: Option<ProjectId>,
    #[serde(default)]
    q: Option<String>,
    #[serde(default)]
    limit: Option<i64>,
}

pub struct TasksOptions;

impl Op for TasksOptions {
    const NAME: OpName = OpName::TasksOptions;
    const KIND: Kind = Kind::Query;
    const MCP: bool = true;
    type Input = OptionsInput;
    type Output = TaskList;

    fn description() -> &'static str {
        crate::descriptions::TASKS_OPTIONS
    }

    async fn run(ctx: &Ctx, input: Self::Input) -> Result<Self::Output> {
        if let Some(limit) = input.limit
            && !(1..=5000).contains(&limit)
        {
            return Err(AppError::validation("limit must be between 1 and 5000"));
        }
        xboct_log_core::task_options(
            &ctx.db,
            input.project_id.as_ref().map(ProjectId::as_str),
            input.q.as_deref(),
            input.limit,
        )
        .await
    }
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct StatsInput {}

pub struct TasksStats;

impl Op for TasksStats {
    const NAME: OpName = OpName::TasksStats;
    const KIND: Kind = Kind::Query;
    const MCP: bool = true;
    type Input = StatsInput;
    type Output = Value;

    fn description() -> &'static str {
        crate::descriptions::TASKS_STATS
    }

    async fn run(ctx: &Ctx, _input: Self::Input) -> Result<Self::Output> {
        xboct_log_core::task_stats(&ctx.db).await
    }
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RevisionsInput {
    task_id: TaskKey,
    #[serde(default)]
    field: Option<String>,
    #[serde(default)]
    limit: Option<i64>,
}

pub struct TasksRevisionsList;

impl Op for TasksRevisionsList {
    const NAME: OpName = OpName::TasksRevisionsList;
    const KIND: Kind = Kind::Query;
    const MCP: bool = true;
    type Input = RevisionsInput;
    type Output = Value;

    fn description() -> &'static str {
        crate::descriptions::TASKS_REVISIONS_LIST
    }

    async fn run(ctx: &Ctx, input: Self::Input) -> Result<Self::Output> {
        if let Some(field) = &input.field
            && field != "description"
            && field != "comment"
        {
            return Err(AppError::validation(
                "field must be 'description' or 'comment'",
            ));
        }
        if let Some(limit) = input.limit
            && !(1..=200).contains(&limit)
        {
            return Err(AppError::validation("limit must be between 1 and 200"));
        }
        xboct_log_core::list_revisions(
            &ctx.db,
            input.task_id.as_str(),
            input.field.as_deref(),
            input.limit,
        )
        .await
    }
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DeletedListInput {
    #[serde(default)]
    project_id: Option<ProjectId>,
    #[serde(default)]
    q: Option<String>,
    #[serde(default)]
    limit: Option<i64>,
    #[serde(default)]
    offset: Option<i64>,
}

pub struct TasksDeletedList;

impl Op for TasksDeletedList {
    const NAME: OpName = OpName::TasksDeletedList;
    const KIND: Kind = Kind::Query;
    const MCP: bool = true;
    type Input = DeletedListInput;
    type Output = TaskList;

    fn description() -> &'static str {
        crate::descriptions::TASKS_DELETED_LIST
    }

    async fn run(ctx: &Ctx, input: Self::Input) -> Result<Self::Output> {
        let limit = input.limit.unwrap_or(50);
        if !(1..=200).contains(&limit) {
            return Err(AppError::validation("limit must be between 1 and 200"));
        }
        let offset = input.offset.unwrap_or(0);
        if offset < 0 {
            return Err(AppError::validation("offset must be zero or positive"));
        }
        let mut query = json!({
            "deleted_only": true,
            "limit": limit,
            "offset": offset
        });
        if let Some(project_id) = &input.project_id {
            query["project_id"] = json!(project_id);
        }
        if let Some(q) = &input.q {
            query["q"] = json!(q);
        }
        let filters: xboct_log_core::TaskFilters = serde_json::from_value(query)?;
        list_tasks(&ctx.db, &filters).await
    }
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct GetManyInput {
    task_ids: Vec<TaskKey>,
}

pub struct TasksGetMany;

impl Op for TasksGetMany {
    const NAME: OpName = OpName::TasksGetMany;
    const KIND: Kind = Kind::Query;
    const MCP: bool = true;
    type Input = GetManyInput;
    type Output = Value;

    fn description() -> &'static str {
        crate::descriptions::TASKS_GET_MANY
    }

    async fn run(ctx: &Ctx, input: Self::Input) -> Result<Self::Output> {
        let ids: Vec<String> = input
            .task_ids
            .iter()
            .map(|key| key.as_str().to_string())
            .collect();
        let many = xboct_log_core::get_tasks_by_ids(&ctx.db, &ids).await?;
        Ok(serde_json::to_value(many)?)
    }
}
