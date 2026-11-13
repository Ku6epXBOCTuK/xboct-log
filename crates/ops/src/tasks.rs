use serde::Deserialize;
use serde_json::{Value, json};
use xboct_log_core::{
    AppError, ClosedReason, Entity, NewTask, Result, TaskKey, TaskList, TaskPatch, close_task,
    close_task_detailed, count_epic_children_by_status, create_task, get_task, list_tasks,
    update_task, warnings_for,
};

use crate::{Ctx, Kind, Op};

pub struct TasksList;

impl Op for TasksList {
    const NAME: &'static str = "tasks_list";
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
    const NAME: &'static str = "tasks_get";
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
    const NAME: &'static str = "tasks_create";
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
    const NAME: &'static str = "tasks_update";
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
    const NAME: &'static str = "tasks_close";
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
    const NAME: &'static str = "tasks_delete";
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
    const NAME: &'static str = "tasks_restore";
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
    pub project_id: String,
}

impl Op for TasksMove {
    const NAME: &'static str = "tasks_move";
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
            xboct_log_core::move_task(&ctx.db, input.task_id.as_str(), &input.project_id).await?;
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
    const NAME: &'static str = "tasks_create_many";
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
    const NAME: &'static str = "tasks_update_many";
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
    const NAME: &'static str = "tasks_close_many";
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
