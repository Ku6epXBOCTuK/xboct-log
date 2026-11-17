use serde::Deserialize;
use xboct_log_core::{
    ActivityPage, ActivitySearch, Entity, HistoryPage, OpName, Result, TaskKey, list_activity,
    resolve_task_id, search_activity, validate_activity_search,
};

use crate::{Ctx, Kind, Op};

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct HistoryInput {
    pub task_id: TaskKey,
    #[serde(default)]
    pub limit: Option<i64>,
}

pub struct TasksHistory;

impl Op for TasksHistory {
    const NAME: OpName = OpName::TasksHistory;
    const KIND: Kind = Kind::Query;
    const MCP: bool = true;
    type Input = HistoryInput;
    type Output = HistoryPage;

    fn description() -> &'static str {
        crate::descriptions::TASKS_HISTORY
    }

    fn entity() -> Option<Entity> {
        Some(Entity::Tasks)
    }

    async fn run(ctx: &Ctx, input: Self::Input) -> Result<Self::Output> {
        let key = resolve_task_id(&ctx.db, input.task_id.as_str()).await?;
        list_activity(&ctx.db, "task", key.as_str(), input.limit, None).await
    }
}

pub struct ActivitiesList;

impl Op for ActivitiesList {
    const NAME: OpName = OpName::ActivityList;
    const KIND: Kind = Kind::Query;
    const MCP: bool = true;
    type Input = ActivitySearch;
    type Output = ActivityPage;

    fn description() -> &'static str {
        crate::descriptions::ACTIVITY_LIST
    }

    async fn run(ctx: &Ctx, input: Self::Input) -> Result<Self::Output> {
        validate_activity_search(&input)?;
        search_activity(&ctx.db, &input).await
    }
}
