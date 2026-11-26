use super::*;

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct OptionsInput {
    #[schemars(description = "Project id: the tasks of this project only.")]
    #[serde(default)]
    project_id: Option<ProjectId>,
    #[schemars(
        description = "Search over the whole backlog: words are OR-ed, =12 and =LOG-12 match one task exactly."
    )]
    #[serde(default)]
    q: Option<String>,
    #[schemars(description = "Item cap, 50 by default.")]
    #[serde(default)]
    limit: Option<i64>,
}

pub struct TasksOptions;

impl Op for TasksOptions {
    const NAME: OpName = OpName::TasksOptions;
    const KIND: Kind = Kind::Query;
    const MCP: bool = true;
    const LAZY: bool = true;
    type Input = OptionsInput;
    type Output = TaskList;

    fn description() -> &'static str {
        crate::descriptions::TASKS_OPTIONS
    }

    async fn run(ctx: &Ctx, input: Self::Input) -> Result<Self::Output> {
        validate_limit(input.limit, 50, 5000)?;
        xboct_log_core::task_options(
            &ctx.db,
            input.project_id.as_ref().map(ProjectId::as_str),
            input.q.as_deref(),
            input.limit,
        )
        .await
    }
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct StatsInput {}

pub struct TasksStats;

impl Op for TasksStats {
    const NAME: OpName = OpName::TasksStats;
    const KIND: Kind = Kind::Query;
    const MCP: bool = true;
    const LAZY: bool = true;
    type Input = StatsInput;
    type Output = TaskStats;

    fn description() -> &'static str {
        crate::descriptions::TASKS_STATS
    }

    async fn run(ctx: &Ctx, _input: Self::Input) -> Result<Self::Output> {
        xboct_log_core::task_stats(&ctx.db).await
    }
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct RevisionsInput {
    task_id: TaskKey,
    #[schemars(
        description = "Keep only the revisions of this field. Omit it to get both descriptions and comments."
    )]
    #[serde(default)]
    field: Option<String>,
    #[schemars(description = "Maximum number of revisions to return (default 50, max 200).")]
    #[serde(default)]
    limit: Option<i64>,
}

pub struct TasksRevisionsList;

impl Op for TasksRevisionsList {
    const NAME: OpName = OpName::TasksRevisionsList;
    const KIND: Kind = Kind::Query;
    const MCP: bool = true;
    const LAZY: bool = true;
    type Input = RevisionsInput;
    type Output = RevisionsPage;

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
        validate_limit(input.limit, 50, 200)?;
        xboct_log_core::list_revisions(
            &ctx.db,
            input.task_id.as_str(),
            input.field.as_deref(),
            input.limit,
        )
        .await
    }
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct DeletedListInput {
    #[schemars(description = "Project id: keeps only the deleted tasks of that project.")]
    #[serde(default)]
    project_id: Option<ProjectId>,
    #[schemars(description = "Text to search in the id, the title and the description.")]
    #[serde(default)]
    q: Option<String>,
    #[schemars(description = "Maximum number of tasks to return (default 50, max 200).")]
    #[serde(default)]
    limit: Option<i64>,
    #[schemars(description = "Number of tasks to skip, for pagination.")]
    #[serde(default)]
    offset: Option<i64>,
}

pub struct TasksDeletedList;

impl Op for TasksDeletedList {
    const NAME: OpName = OpName::TasksDeletedList;
    const KIND: Kind = Kind::Query;
    const MCP: bool = true;
    const LAZY: bool = true;
    type Input = DeletedListInput;
    type Output = TaskList;

    fn description() -> &'static str {
        crate::descriptions::TASKS_DELETED_LIST
    }

    async fn run(ctx: &Ctx, input: Self::Input) -> Result<Self::Output> {
        let limit = validate_limit(input.limit, 50, 200)?.get();
        let offset = validate_offset(input.offset)?.get();
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

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct GetManyInput {
    #[schemars(description = "List of task IDs to fetch.")]
    task_ids: Vec<TaskKey>,
}

pub struct TasksGetMany;

impl Op for TasksGetMany {
    const NAME: OpName = OpName::TasksGetMany;
    const KIND: Kind = Kind::Query;
    const MCP: bool = true;
    const LAZY: bool = true;
    type Input = GetManyInput;
    type Output = TaskMany;

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
        Ok(many)
    }
}
