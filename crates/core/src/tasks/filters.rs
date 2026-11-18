use schemars::JsonSchema;
use serde::Deserialize;

use crate::{
    AppError, Result,
    ids::{ProjectId, ScopeId, Seq, TagName, TaskKey},
};

use super::model::{Estimate, Priority, Status};

#[derive(Debug, Clone, Deserialize, JsonSchema)]
#[serde(untagged)]
pub enum OneOrList<T> {
    One(T),
    Many(Vec<T>),
}

impl<T> OneOrList<T> {
    pub fn into_vec(self) -> Vec<T> {
        match self {
            Self::One(value) => vec![value],
            Self::Many(values) => values,
        }
    }
}

#[derive(Debug, Clone, Deserialize, JsonSchema)]
#[serde(untagged)]
pub enum FieldSelection {
    Csv(String),
    List(Vec<String>),
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub enum LinkFilter<T> {
    #[default]
    Any,
    Null,
    Values(Vec<T>),
}

impl<'de, T: Deserialize<'de>> Deserialize<'de> for LinkFilter<T> {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        Ok(match Option::<OneOrList<T>>::deserialize(deserializer)? {
            None => Self::Null,
            Some(OneOrList::One(value)) => Self::Values(vec![value]),
            Some(OneOrList::Many(values)) => Self::Values(values),
        })
    }
}

impl<T: JsonSchema> JsonSchema for LinkFilter<T> {
    fn schema_name() -> std::borrow::Cow<'static, str> {
        format!("LinkFilter_for_{}", T::schema_name()).into()
    }

    fn json_schema(generator: &mut schemars::SchemaGenerator) -> schemars::Schema {
        Option::<OneOrList<T>>::json_schema(generator)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum Sort {
    UpdatedAt,
    CreatedAt,
    ClosedAt,
    Priority,
    Status,
    Project,
    Number,
    Title,
    PlanPosition,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum Order {
    Asc,
    Desc,
}

#[derive(Debug, Clone, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct TaskFilters {
    #[schemars(
        description = "Filter by project id (e.g. 'eit'). Accepts one id or a list of ids; a list matches tasks of any of them."
    )]
    pub project_id: Option<OneOrList<ProjectId>>,
    #[schemars(
        description = "Exclude projects: only tasks of other projects are returned. Accepts one id or a list of ids. Combine with project_id to get 'every project except X'."
    )]
    pub exclude_project_id: Option<OneOrList<ProjectId>>,
    pub status: Option<OneOrList<Status>>,
    pub priority: Option<OneOrList<Priority>>,
    #[schemars(
        description = "Filter by estimate: one value or a list of them. Tasks without an estimate are not matched."
    )]
    pub estimate: Option<OneOrList<Estimate>>,
    #[schemars(
        description = "Filter by assignee: one name or a list of them, matched case-insensitively. Tasks without an assignee are not matched."
    )]
    pub assignee: Option<OneOrList<String>>,
    #[schemars(
        description = "Filter by due date: only tasks due strictly before this date (YYYY-MM-DD). Tasks without a due date are not matched."
    )]
    pub due_before: Option<String>,
    #[schemars(
        description = "Filter by due date: only tasks due on or after this date (YYYY-MM-DD). Tasks without a due date are not matched."
    )]
    pub due_after: Option<String>,
    #[schemars(
        description = "Exact tag match, case-insensitive; no wildcards. Use q to match a partial tag."
    )]
    pub tag: Option<OneOrList<TagName>>,
    pub is_epic: Option<bool>,
    #[schemars(
        description = "Filter by epic. Accepts the full epic id (e.g. 'LOG-5') or a list of them; a list matches tasks of any of the given epics. null matches tasks without an epic."
    )]
    #[serde(default)]
    pub epic_id: LinkFilter<TaskKey>,
    #[schemars(
        description = "Filter by scope id. Accepts one scope id or a list of them; a list matches tasks of any of the given scopes. null matches tasks without a scope."
    )]
    #[serde(default)]
    pub scope_id: LinkFilter<ScopeId>,
    #[schemars(
        description = "Filter by the presence of an epic: true matches tasks that belong to an epic, false matches tasks without one."
    )]
    pub has_epic: Option<bool>,
    #[schemars(
        description = "Filter by plan id. Matches tasks that are items of this plan; plans are global, so items may belong to any project."
    )]
    pub plan_id: Option<String>,
    #[schemars(
        description = "Filter by the presence of a plan: true matches tasks that are items of at least one plan, false matches tasks in no plan."
    )]
    pub has_plan: Option<bool>,
    #[schemars(
        description = "Filter by the presence of a scope: true matches tasks with a scope assigned, false matches tasks without one."
    )]
    pub has_scope: Option<bool>,
    #[schemars(
        description = "Filter by the presence of tags: true matches tasks with at least one tag, false matches tasks without tags."
    )]
    pub has_tags: Option<bool>,
    #[schemars(
        description = "Filter by the blocked_by list: returns tasks whose blocked_by list contains the given task (the tasks it blocks)."
    )]
    pub blocked_by: Option<TaskKey>,
    #[schemars(
        description = "Filter by the blocks list: returns tasks whose blocks list contains the given task (the tasks blocking it)."
    )]
    pub blocks: Option<TaskKey>,
    #[schemars(
        description = "Case-insensitive substring search across title, description, id, the id of the epic and tags. Tags match by substring: q='est:' finds tasks with a tag like 'est:L'. Use tag for a whole-tag match."
    )]
    pub q: Option<String>,
    #[schemars(
        description = "Search terms combined with OR: a task matches when any term matches its title, description, id, epic id or tags as a substring. Combined with the other filters by AND. Use it instead of q for multi-word input."
    )]
    pub q_any: Option<Vec<String>>,
    #[schemars(
        description = "Exact task numbers (the part after the prefix, e.g. 29 for LOG-29). A task matches any of them. Exact hits are returned first and are OR-ed with q_any and id_exact."
    )]
    pub number_exact: Option<Vec<Seq>>,
    #[schemars(
        description = "Exact full task ids (e.g. 'LOG-29'), matched case-insensitively. A task matches any of them. Exact hits are returned first and are OR-ed with q_any and number_exact."
    )]
    pub id_exact: Option<Vec<TaskKey>>,
    #[schemars(description = "Case-insensitive substring match on the task title.")]
    pub title: Option<String>,
    #[schemars(description = "Case-insensitive exact match on the task title.")]
    pub title_exact: Option<String>,
    #[schemars(
        description = "Case-insensitive substring match on the source file path of the task (e.g. 'backlog.md'). Tasks without a source file are excluded."
    )]
    pub source_file: Option<String>,
    #[schemars(
        description = "Fields to include in each item to reduce response size: a comma-separated string (e.g. id,number,title,status) or an array of names. Supported fields: id, project_id, number, title, description, status, priority, is_epic, epic_id, scope_id, source_file, tags, estimate, assignee, due_at, attachments_count, created_at, updated_at, closed_at, closed_reason, blocked_reason, deleted_at, project_name, scope_name, short_description, blocked_by, blocks, relates_to, duplicates, duplicated_by, plan_ids. Requesting 'description' also returns the full text and drops short_description. id, project_id and number are always present, so a follow-up call can still address the task. project_name is present only with include_project, scope_name only with include_scope. Unknown field names are ignored; if no name matches, the whole task is returned."
    )]
    pub fields: Option<FieldSelection>,
    #[schemars(
        description = "Include the full description. By default each task carries short_description (first line, trimmed, truncated to ~120 chars) instead of the full text; with include_description the full text is returned and short_description is omitted."
    )]
    pub include_description: Option<bool>,
    #[schemars(
        description = "Attach the project name (project_name) to each task. Does not filter by project archival; use project_archived for that."
    )]
    pub include_project: Option<bool>,
    #[schemars(description = "Attach the scope name (scope_name) to each task.")]
    pub include_scope: Option<bool>,
    #[schemars(
        description = "Filter by project archival: false - active projects only, true - archived projects only. Omitted - both."
    )]
    pub project_archived: Option<bool>,
    #[schemars(
        description = "Sort key. 'number' orders by the per-project task number (ascending by default), 'title' orders by title case-insensitively (ascending by default), 'status' by the workflow order backlog, open, in-progress, blocked, done, cancelled and 'project' by project name; 'updated_at' and 'created_at' default to descending, 'priority' to ascending. 'closed_at' orders by the closing date and keeps the tasks that are not closed at the end. 'plan_position' orders by the item position in the plan given by plan_id and requires that filter."
    )]
    pub sort: Option<Sort>,
    #[schemars(
        description = "Sort direction. Defaults to asc for priority, status, project, number and title, desc for the date keys."
    )]
    pub order: Option<Order>,
    #[schemars(
        description = "Include soft-deleted tasks. By default they are hidden; with true the deleted_at field is populated."
    )]
    pub include_deleted: Option<bool>,
    pub deleted_only: Option<bool>,
    #[schemars(
        description = "Maximum number of tasks to return (default 100, max 1000). Combine with offset and the response total to paginate."
    )]
    #[serde(default = "default_limit")]
    pub limit: u32,
    #[serde(default)]
    pub offset: u32,
}

fn default_limit() -> u32 {
    100
}

impl TaskFilters {
    pub fn validate(&self) -> Result<()> {
        if !(1..=1000).contains(&self.limit) {
            return Err(AppError::validation("limit must be between 1 and 1000"));
        }
        if self.q_any.as_ref().is_some_and(Vec::is_empty) {
            return Err(AppError::validation("q_any needs at least one term"));
        }
        if self.number_exact.as_ref().is_some_and(Vec::is_empty) {
            return Err(AppError::validation(
                "number_exact needs at least one number",
            ));
        }
        if self.id_exact.as_ref().is_some_and(Vec::is_empty) {
            return Err(AppError::validation("id_exact needs at least one id"));
        }
        if self.sort == Some(Sort::PlanPosition) && self.plan_id.is_none() {
            return Err(AppError::validation("sort=plan_position requires plan_id"));
        }
        Ok(())
    }

    pub fn limit(&self) -> i64 {
        i64::from(self.limit)
    }

    pub fn offset(&self) -> i64 {
        i64::from(self.offset)
    }

    pub fn descending(&self) -> bool {
        match self.order {
            Some(Order::Asc) => false,
            Some(Order::Desc) => true,
            None => !matches!(
                self.sort.unwrap_or(Sort::UpdatedAt),
                Sort::Priority
                    | Sort::Status
                    | Sort::Project
                    | Sort::Number
                    | Sort::Title
                    | Sort::PlanPosition
            ),
        }
    }

    pub fn sort(&self) -> Sort {
        self.sort.unwrap_or(Sort::UpdatedAt)
    }
}
