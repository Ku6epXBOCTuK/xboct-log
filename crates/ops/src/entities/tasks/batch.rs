use super::*;

pub struct TasksCreateMany;

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct CreateManyInput {
    #[schemars(
        description = "At least one item; every item needs its own project_id and title, and epic_id is optional. A top-level project_id is not accepted. Example: {\"items\":[{\"project_id\":\"brul\",\"title\":\"...\",\"epic_id\":\"BRUL-276\"}]}"
    )]
    pub items: Vec<NewTask>,
}

impl Op for TasksCreateMany {
    const NAME: OpName = OpName::TasksCreateMany;
    const KIND: Kind = Kind::Command;
    const MCP: bool = true;
    const LAZY: bool = true;

    type Input = CreateManyInput;
    type Output = BatchSummary;

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
                Ok(created) => items.push(BatchItem::Ok(Box::new(BatchOk {
                    index,
                    id: Some(created.task.id.to_string()),
                    ok: true,
                    task: created.task,
                    changes: Vec::new(),
                    released: Vec::new(),
                    warnings: created.warnings,
                    closed_epic: None,
                    reopened_epic: None,
                }))),
                Err(error) => items.push(batch_error(index, None, &error)),
            }
        }
        Ok(summary(items))
    }
}

pub struct TasksUpdateMany;

#[derive(Debug, Deserialize, JsonSchema)]
pub struct UpdateManyInput {
    pub items: Vec<UpdateInput>,
}

impl Op for TasksUpdateMany {
    const NAME: OpName = OpName::TasksUpdateMany;
    const KIND: Kind = Kind::Command;
    const MCP: bool = true;
    const LAZY: bool = true;

    type Input = UpdateManyInput;
    type Output = BatchSummary;

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

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct CloseManyInput {
    pub items: Vec<CloseInput>,
}

impl Op for TasksCloseMany {
    const NAME: OpName = OpName::TasksCloseMany;
    const KIND: Kind = Kind::Command;
    const MCP: bool = true;
    const LAZY: bool = true;

    type Input = CloseManyInput;
    type Output = BatchSummary;

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

#[derive(Debug, Clone, Copy, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum LinkKindInput {
    RelatesTo,
    Duplicates,
}
