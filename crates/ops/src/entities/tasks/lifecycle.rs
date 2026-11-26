use super::*;

pub struct TasksClose;

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct CloseInput {
    #[schemars(description = "Full task id, e.g. 'LOG-82'.")]
    pub task_id: TaskKey,
    pub reason: ClosedReason,
}

impl Op for TasksClose {
    const NAME: OpName = OpName::TasksClose;
    const KIND: Kind = Kind::Command;
    const MCP: bool = true;

    type Input = CloseInput;
    type Output = Closed;

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

#[derive(Debug, Serialize, JsonSchema)]

pub struct TasksDelete;

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct DeleteInput {
    pub task_id: TaskKey,
}

impl Op for TasksDelete {
    const NAME: OpName = OpName::TasksDelete;
    const KIND: Kind = Kind::Command;
    const MCP: bool = true;
    const LAZY: bool = true;

    type Input = DeleteInput;
    type Output = Deleted;

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
    const LAZY: bool = true;

    type Input = DeleteInput;
    type Output = Task;

    fn description() -> &'static str {
        crate::descriptions::TASKS_RESTORE
    }

    fn entity() -> Option<Entity> {
        Some(Entity::Tasks)
    }

    async fn run(ctx: &Ctx, input: Self::Input) -> Result<Self::Output> {
        xboct_log_core::restore_task(&ctx.db, input.task_id.as_str()).await
    }
}

pub struct TasksMove;

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct MoveInput {
    pub task_id: TaskKey,
    #[schemars(description = "Destination project id (e.g. 'eit').")]
    pub project_id: ProjectId,
}

impl Op for TasksMove {
    const NAME: OpName = OpName::TasksMove;
    const KIND: Kind = Kind::Command;
    const MCP: bool = true;
    const LAZY: bool = true;

    type Input = MoveInput;
    type Output = Task;

    fn description() -> &'static str {
        crate::descriptions::TASKS_MOVE
    }

    fn entity() -> Option<Entity> {
        Some(Entity::Tasks)
    }

    async fn run(ctx: &Ctx, input: Self::Input) -> Result<Self::Output> {
        xboct_log_core::move_task(&ctx.db, input.task_id.as_str(), input.project_id.as_str()).await
    }
}
