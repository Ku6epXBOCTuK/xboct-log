use serde::Deserialize;
use serde_json::{Value, json};
use xboct_log_core::{
    AppError, Entity, Result, TaskList, count_epic_children_by_status, get_task, list_tasks,
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
        "List tasks with filters (project, status, priority, estimate, assignee, due date, tags, epic, scope, blocked_by, blocks, text query, title, title_exact, source_file), sorting and pagination. Use q to locate a task by id, title, description, the id of its epic or a partial tag (e.g. q='LOG-4', q='26', q='est:'). Returns: {items, total} - items is the list of matching tasks, total is the count of all matching tasks before limit/offset. limit defaults to 100 (max 1000); use offset and total to paginate. Use fields to limit returned columns; the field names it accepts are listed in the description of the fields parameter, unknown names are ignored, and id, project_id and number always stay in the result. By default each task carries short_description (first line, ~120 chars) instead of the full description; set include_description to get the full text, in which case short_description is omitted. include_project attaches project names, include_scope attaches scope names, and neither filters; project_archived filters by project archival; include_deleted also returns soft-deleted tasks (hidden by default). Task id is the full 'PREFIX-NUMBER' identifier (e.g. 'LOG-82'); number is the per-project sequence number (e.g. 82), unique only inside its project. project_id accepts one id or a list of ids; exclude_project_id drops the given projects (use it for 'every project except X'). The epic filter accepts a full epic id (e.g. 'LOG-5') or a list of them; scope_id likewise takes one scope id or a list, and null matches tasks without that link. has_epic and has_scope filter by the presence of an epic or a scope. The estimate filter takes one size or a list of them ('S', 'M', 'L'); tasks without an estimate are not matched. The assignee filter takes one name or a list of them and matches case-insensitively; tasks without an assignee are not matched. The due_before and due_after filters take a date (YYYY-MM-DD) and select the tasks due before it or on and after it; tasks without a due date are not matched, so the two together give a due window. sort accepts updated_at, created_at, closed_at, priority, number and title. The blocked_by filter returns tasks whose blocked_by list contains the given task, the blocks filter returns tasks whose blocks list contains the given task. The source_file filter matches the source file path of a task partially and case-insensitively, so a fragment such as 'backlog' selects every task imported from that file. Every task carries blocked_by (tasks that block me) and blocks (tasks I block) as id lists."
    }

    async fn run(ctx: &Ctx, input: Self::Input) -> Result<Self::Output> {
        list_tasks(&ctx.db, &input).await
    }
}

pub struct TasksGet;

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct GetInput {
    pub task_id: String,
}

impl Op for TasksGet {
    const NAME: &'static str = "tasks_get";
    const KIND: Kind = Kind::Query;
    const MCP: bool = true;

    type Input = GetInput;
    type Output = Value;

    fn description() -> &'static str {
        "Get a single task by task_id. The task_id must use the full 'PREFIX-NUMBER' form (e.g. 'LOG-82'); a bare number is rejected because it is unique only inside a project. Returns: the task itself - {id, project_id, number, title, description, status, priority, is_epic, epic_id, scope_id, source_file, tags, estimate, assignee, due_at, attachments_count, created_at, updated_at, closed_at, closed_reason, blocked_reason, deleted_at, project_name, scope_name, short_description, blocked_by, blocks, relates_to, duplicates, duplicated_by, children_counts}. For a task with is_epic=true the result also carries children_counts: the number of its child tasks per status (backlog, open, in-progress, blocked, done, cancelled) plus their total."
    }

    fn entity() -> Option<Entity> {
        None
    }

    async fn run(ctx: &Ctx, input: Self::Input) -> Result<Self::Output> {
        let task = get_task(&ctx.db, &input.task_id).await?;
        let epic = task.is_epic;
        let key = task.id.clone();
        let mut value =
            serde_json::to_value(task).map_err(|error| AppError::unexpected(error.to_string()))?;
        if epic {
            let counts = count_epic_children_by_status(&ctx.db, &key).await?;
            if let Value::Object(object) = &mut value {
                object.insert("children_counts".to_string(), json!(counts));
            }
        }
        Ok(value)
    }
}
