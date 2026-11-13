use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
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

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
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

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Estimate {
    #[serde(rename = "S")]
    Small,
    #[serde(rename = "M")]
    Medium,
    #[serde(rename = "L")]
    Large,
}

impl Estimate {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Small => "S",
            Self::Medium => "M",
            Self::Large => "L",
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct Task {
    pub id: String,
    pub project_id: String,
    pub number: i64,
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    pub status: String,
    pub priority: String,
    pub is_epic: bool,
    pub epic_id: Option<String>,
    pub scope_id: Option<i64>,
    pub source_file: Option<String>,
    pub tags: Vec<String>,
    pub estimate: Option<String>,
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
    pub blocked_by: Vec<String>,
    pub blocks: Vec<String>,
    pub relates_to: Vec<String>,
    pub duplicates: Vec<String>,
    pub duplicated_by: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub children_counts: Option<BTreeMap<String, i64>>,
}

#[derive(Debug, Clone, Serialize)]
pub struct TaskList {
    pub items: Vec<serde_json::Value>,
    pub total: i64,
}

#[derive(Debug, Clone, Default)]
pub struct BlockingInfo {
    pub blocked_by: Vec<String>,
    pub blocks: Vec<String>,
    pub relates_to: Vec<String>,
    pub duplicates: Vec<String>,
    pub duplicated_by: Vec<String>,
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
