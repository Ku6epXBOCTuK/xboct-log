use super::*;

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct LinkInput {
    #[schemars(
        description = "Task id of the source task in the full 'PREFIX-NUMBER' form (e.g. 'LOG-82'). A bare number is rejected: numbers are unique only inside a project."
    )]
    pub task_id: TaskKey,
    #[schemars(
        description = "Link type: 'relates_to' is symmetric (one record, visible from both tasks) and does not gate completion; use tasks_add_blocker when one task cannot close until the other lands. 'duplicates' is directed (id duplicates target)."
    )]
    pub link_type: LinkKindInput,
    #[schemars(
        description = "Task id of the target task in the full 'PREFIX-NUMBER' form (e.g. 'LOG-82'). A bare number is rejected: numbers are unique only inside a project."
    )]
    pub target: TaskKey,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct BlockerInput {
    #[schemars(
        description = "Task id of the blocked task in the full 'PREFIX-NUMBER' form (e.g. 'LOG-82'). A bare number is rejected: numbers are unique only inside a project."
    )]
    pub task_id: TaskKey,
    #[schemars(
        description = "Task id of the blocking task in the full 'PREFIX-NUMBER' form (e.g. 'LOG-82'). A bare number is rejected: numbers are unique only inside a project."
    )]
    pub blocked_by: TaskKey,
}

fn linked_output(task: Task, changes: Vec<Change>, released: Vec<ReleasedLink>) -> Linked {
    Linked {
        task,
        changes,
        released,
    }
}

pub struct TasksAddLink;

impl Op for TasksAddLink {
    const NAME: OpName = OpName::TasksAddLink;
    const KIND: Kind = Kind::Command;
    const MCP: bool = true;
    const LAZY: bool = true;

    type Input = LinkInput;
    type Output = Linked;

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
        Ok(linked_output(after, changes, Vec::new()))
    }
}

pub struct TasksRemoveLink;

impl Op for TasksRemoveLink {
    const NAME: OpName = OpName::TasksRemoveLink;
    const KIND: Kind = Kind::Command;
    const MCP: bool = true;
    const LAZY: bool = true;

    type Input = LinkInput;
    type Output = Linked;

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
        Ok(linked_output(after, changes, Vec::new()))
    }
}

pub struct TasksAddBlocker;

impl Op for TasksAddBlocker {
    const NAME: OpName = OpName::TasksAddBlocker;
    const KIND: Kind = Kind::Command;
    const MCP: bool = true;
    const LAZY: bool = true;

    type Input = BlockerInput;
    type Output = Linked;

    fn description() -> &'static str {
        crate::descriptions::TASKS_ADD_BLOCKER
    }

    fn entity() -> Option<Entity> {
        Some(Entity::Tasks)
    }

    async fn run(ctx: &Ctx, input: Self::Input) -> Result<Self::Output> {
        let before = get_task(&ctx.db, input.task_id.as_str()).await?;
        let released =
            xboct_log_core::add_blocker(&ctx.db, input.task_id.as_str(), input.blocked_by.as_str())
                .await?;
        let after = get_task(&ctx.db, input.task_id.as_str()).await?;
        let changes = xboct_log_core::link_changes(&before, &after, "blocked_by");
        let released = released
            .into_iter()
            .filter(|link| link.task_id != input.task_id)
            .collect();
        Ok(linked_output(after, changes, released))
    }
}

pub struct TasksRemoveBlocker;

impl Op for TasksRemoveBlocker {
    const NAME: OpName = OpName::TasksRemoveBlocker;
    const KIND: Kind = Kind::Command;
    const MCP: bool = true;
    const LAZY: bool = true;

    type Input = BlockerInput;
    type Output = Linked;

    fn description() -> &'static str {
        crate::descriptions::TASKS_REMOVE_BLOCKER
    }

    fn entity() -> Option<Entity> {
        Some(Entity::Tasks)
    }

    async fn run(ctx: &Ctx, input: Self::Input) -> Result<Self::Output> {
        let before = get_task(&ctx.db, input.task_id.as_str()).await?;
        let released = xboct_log_core::remove_blocker(
            &ctx.db,
            input.task_id.as_str(),
            input.blocked_by.as_str(),
        )
        .await?;
        let after = get_task(&ctx.db, input.task_id.as_str()).await?;
        let changes = xboct_log_core::link_changes(&before, &after, "blocked_by");
        let released = released
            .into_iter()
            .filter(|link| link.task_id != input.task_id)
            .collect();
        Ok(linked_output(after, changes, released))
    }
}
