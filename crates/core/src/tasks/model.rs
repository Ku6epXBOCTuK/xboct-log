use std::collections::BTreeMap;

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::{
    ids::{ProjectId, ScopeId, Seq, TagName, TaskKey},
    plans::PlanRef,
};

#[derive(
    Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize, JsonSchema,
)]
#[serde(rename_all = "kebab-case")]
pub enum Status {
    Backlog,
    Open,
    InProgress,
    Blocked,
    Done,
    Cancelled,
}

impl Status {
    pub const ALL: [Self; 6] = [
        Self::Backlog,
        Self::Open,
        Self::InProgress,
        Self::Blocked,
        Self::Done,
        Self::Cancelled,
    ];

    pub const ACTIVE: [Self; 3] = [Self::Open, Self::InProgress, Self::Blocked];

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Backlog => "backlog",
            Self::Open => "open",
            Self::InProgress => "in-progress",
            Self::Blocked => "blocked",
            Self::Done => "done",
            Self::Cancelled => "cancelled",
        }
    }

    pub fn rank(self) -> i64 {
        match self {
            Self::Backlog => 0,
            Self::Open => 1,
            Self::InProgress => 2,
            Self::Blocked => 3,
            Self::Done => 4,
            Self::Cancelled => 5,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "kebab-case")]
pub enum Priority {
    Low,
    Medium,
    High,
    Critical,
}

impl Priority {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Low => "low",
            Self::Medium => "medium",
            Self::High => "high",
            Self::Critical => "critical",
        }
    }

    pub fn rank(self) -> i64 {
        match self {
            Self::Low => 3,
            Self::Medium => 2,
            Self::High => 1,
            Self::Critical => 0,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub enum Estimate {
    #[serde(rename = "S")]
    Small,
    #[serde(rename = "M")]
    Medium,
    #[serde(rename = "L")]
    Large,
    #[serde(rename = "XL")]
    ExtraLarge,
}

impl Estimate {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Small => "S",
            Self::Medium => "M",
            Self::Large => "L",
            Self::ExtraLarge => "XL",
        }
    }

    pub fn from_db(value: &str) -> Option<Self> {
        match value {
            "S" => Some(Self::Small),
            "M" => Some(Self::Medium),
            "L" => Some(Self::Large),
            "XL" => Some(Self::ExtraLarge),
            _ => None,
        }
    }
}

impl Status {
    pub fn from_db(value: &str) -> Option<Self> {
        Self::ALL
            .into_iter()
            .find(|status| status.as_str() == value)
    }
}

impl Priority {
    pub fn from_db(value: &str) -> Option<Self> {
        [Self::Low, Self::Medium, Self::High, Self::Critical]
            .into_iter()
            .find(|priority| priority.as_str() == value)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "kebab-case")]
pub enum ClosedReason {
    Fixed,
    Wontfix,
    Obsolete,
    Duplicate,
    NotReproduced,
}

impl ClosedReason {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Fixed => "fixed",
            Self::Wontfix => "wontfix",
            Self::Obsolete => "obsolete",
            Self::Duplicate => "duplicate",
            Self::NotReproduced => "not-reproduced",
        }
    }

    pub fn status(self) -> Status {
        match self {
            Self::Fixed => Status::Done,
            _ => Status::Cancelled,
        }
    }
}

#[derive(Debug, Clone, Serialize, JsonSchema)]
pub struct Task {
    pub id: TaskKey,
    pub project_id: ProjectId,
    pub number: Seq,
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    pub status: Status,
    pub priority: Priority,
    pub is_epic: bool,
    pub epic_id: Option<TaskKey>,
    pub scope_id: Option<ScopeId>,
    pub source_file: Option<String>,
    pub tags: Vec<TagName>,
    pub estimate: Option<Estimate>,
    pub assignee: Option<String>,
    pub due_at: Option<String>,
    pub attachments_count: i64,
    pub created_at: String,
    pub updated_at: String,
    pub closed_at: Option<String>,
    pub closed_reason: Option<String>,
    pub blocked_reason: Option<String>,
    pub deleted_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub project_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub scope_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub short_description: Option<String>,
    pub blocked_by: Vec<TaskKey>,
    pub blocks: Vec<TaskKey>,
    pub relates_to: Vec<TaskKey>,
    pub duplicates: Vec<TaskKey>,
    pub duplicated_by: Vec<TaskKey>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub children_counts: Option<BTreeMap<String, i64>>,
    pub plan_ids: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub plan_names: Option<Vec<PlanRef>>,
}

#[derive(Debug, Clone, Serialize, JsonSchema)]
pub struct TaskView {
    pub id: TaskKey,
    pub project_id: ProjectId,
    pub number: Seq,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<Status>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub priority: Option<Priority>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_epic: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub epic_id: Option<TaskKey>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub scope_id: Option<ScopeId>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_file: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tags: Option<Vec<TagName>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub estimate: Option<Estimate>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub assignee: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub due_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub attachments_count: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub created_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub closed_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub closed_reason: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub blocked_reason: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub deleted_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub project_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub scope_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub short_description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub blocked_by: Option<Vec<TaskKey>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub blocks: Option<Vec<TaskKey>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub relates_to: Option<Vec<TaskKey>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duplicates: Option<Vec<TaskKey>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duplicated_by: Option<Vec<TaskKey>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub children_counts: Option<BTreeMap<String, i64>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub plan_ids: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub plan_names: Option<Vec<PlanRef>>,
}

impl From<Task> for TaskView {
    fn from(task: Task) -> Self {
        Self {
            id: task.id,
            project_id: task.project_id,
            number: task.number,
            title: Some(task.title),
            description: task.description,
            status: Some(task.status),
            priority: Some(task.priority),
            is_epic: Some(task.is_epic),
            epic_id: task.epic_id,
            scope_id: task.scope_id,
            source_file: task.source_file,
            tags: Some(task.tags),
            estimate: task.estimate,
            assignee: task.assignee,
            due_at: task.due_at,
            attachments_count: Some(task.attachments_count),
            created_at: Some(task.created_at),
            updated_at: Some(task.updated_at),
            closed_at: task.closed_at,
            closed_reason: task.closed_reason,
            blocked_reason: task.blocked_reason,
            deleted_at: task.deleted_at,
            project_name: task.project_name,
            scope_name: task.scope_name,
            short_description: task.short_description,
            blocked_by: Some(task.blocked_by),
            blocks: Some(task.blocks),
            relates_to: Some(task.relates_to),
            duplicates: Some(task.duplicates),
            duplicated_by: Some(task.duplicated_by),
            children_counts: task.children_counts,
            plan_ids: Some(task.plan_ids),
            plan_names: task.plan_names,
        }
    }
}

#[derive(Debug, Clone, Serialize, JsonSchema)]
#[serde(untagged)]
pub enum TaskListEntry {
    Full(Task),
    Projected(TaskView),
}

#[derive(Debug, Clone, Serialize, JsonSchema)]
pub struct TaskList {
    pub items: Vec<TaskListEntry>,
    pub total: i64,
    #[schemars(
        description = "Present when more tasks match the filters: repeat the same call with offset set to this value. A page is capped at about 24 KB, so this can happen before limit is reached."
    )]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub next_offset: Option<i64>,
}

#[derive(Debug, Clone, Serialize, JsonSchema)]
pub struct Change {
    pub field: String,
    pub from: Value,
    pub to: Value,
}

#[derive(Debug, Clone, Serialize, JsonSchema)]
pub struct ReleasedLink {
    pub task_id: TaskKey,
    pub changes: Vec<Change>,
}

#[derive(Debug, Serialize, JsonSchema)]
pub struct Created {
    #[serde(flatten)]
    pub task: Task,
    pub warnings: Vec<String>,
}

#[derive(Debug, Serialize, JsonSchema)]
pub struct Updated {
    #[serde(flatten)]
    pub task: Task,
    pub changes: Vec<Change>,
    pub released: Vec<ReleasedLink>,
    pub warnings: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub closed_epic: Option<Task>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reopened_epic: Option<Task>,
}

#[derive(Debug, Serialize, JsonSchema)]
pub struct Closed {
    #[serde(flatten)]
    pub task: Task,
    pub changes: Vec<Change>,
    pub released: Vec<ReleasedLink>,
    pub warnings: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub closed_epic: Option<Task>,
}

#[derive(Debug, Serialize, JsonSchema)]
pub struct Deleted {
    pub id: TaskKey,
    pub deleted_at: String,
    pub changes: Vec<Change>,
    pub released: Vec<ReleasedLink>,
}

#[derive(Debug, Serialize, JsonSchema)]
pub struct Linked {
    #[serde(flatten)]
    pub task: Task,
    pub changes: Vec<Change>,
    pub released: Vec<ReleasedLink>,
}

#[derive(Debug, Serialize, JsonSchema)]
pub struct EpicSummary {
    pub id: TaskKey,
    pub project_id: ProjectId,
    pub title: String,
    pub status: Status,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub children_counts: Option<BTreeMap<String, i64>>,
}

#[derive(Debug, Serialize, JsonSchema)]
pub struct TaskStats {
    pub tasks: BTreeMap<Status, i64>,
    pub epics: Vec<EpicSummary>,
}

#[derive(Debug, Clone, Default)]
pub struct BlockingInfo {
    pub blocked_by: Vec<TaskKey>,
    pub blocks: Vec<TaskKey>,
    pub relates_to: Vec<TaskKey>,
    pub duplicates: Vec<TaskKey>,
    pub duplicated_by: Vec<TaskKey>,
}

#[derive(Debug, sqlx::FromRow)]
pub(crate) struct TaskRow {
    pub key: String,
    pub project_id: String,
    pub number: i64,
    pub title: String,
    pub description: String,
    pub status: String,
    pub priority: String,
    pub is_epic: i64,
    pub scope_id: Option<i64>,
    pub source_file: Option<String>,
    pub estimate: Option<String>,
    pub assignee: Option<String>,
    pub due_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub closed_at: Option<String>,
    pub closed_reason: Option<String>,
    pub blocked_reason: Option<String>,
    pub deleted_at: Option<String>,
    pub epic_key: Option<String>,
    pub attachments_count: i64,
    pub project_name: Option<String>,
    pub scope_name: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn task_view_schema_keeps_every_property_but_requires_only_identity() {
        let task = serde_json::to_value(schemars::schema_for!(Task)).unwrap();
        let view = serde_json::to_value(schemars::schema_for!(TaskView)).unwrap();

        let mut task_properties: Vec<&str> = task["properties"]
            .as_object()
            .unwrap()
            .keys()
            .map(String::as_str)
            .collect();
        let mut view_properties: Vec<&str> = view["properties"]
            .as_object()
            .unwrap()
            .keys()
            .map(String::as_str)
            .collect();
        task_properties.sort_unstable();
        view_properties.sort_unstable();
        assert_eq!(task_properties, view_properties);

        let mut required: Vec<&str> = view["required"]
            .as_array()
            .unwrap()
            .iter()
            .filter_map(serde_json::Value::as_str)
            .collect();
        required.sort_unstable();
        assert_eq!(required, ["id", "number", "project_id"]);
    }
}
