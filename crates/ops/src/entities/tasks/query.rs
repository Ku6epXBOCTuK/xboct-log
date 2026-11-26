use super::*;

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

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct GetInput {
    pub task_id: TaskKey,
}

impl Op for TasksGet {
    const NAME: OpName = OpName::TasksGet;
    const KIND: Kind = Kind::Query;
    const MCP: bool = true;

    type Input = GetInput;
    type Output = Task;

    fn description() -> &'static str {
        crate::descriptions::TASKS_GET
    }

    fn entity() -> Option<Entity> {
        None
    }

    async fn run(ctx: &Ctx, input: Self::Input) -> Result<Self::Output> {
        let mut task = get_task(&ctx.db, input.task_id.as_str()).await?;
        if task.is_epic {
            let counts = count_epic_children_by_status(&ctx.db, task.id.as_str()).await?;
            task.children_counts = Some(counts);
        }
        Ok(task)
    }
}

pub struct TasksCreate;

impl Op for TasksCreate {
    const NAME: OpName = OpName::TasksCreate;
    const KIND: Kind = Kind::Command;
    const MCP: bool = true;

    type Input = NewTask;
    type Output = Created;

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

#[derive(Debug, Deserialize, JsonSchema)]
pub struct UpdateInput {
    #[schemars(description = "Full task id, e.g. 'LOG-82'.")]
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
    type Output = Updated;

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
