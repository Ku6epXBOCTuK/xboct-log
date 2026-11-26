use schemars::JsonSchema;

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use xboct_log_core::{
    AppError, Change, Closed, ClosedReason, Created, Deleted, Entity, Linked, NewTask, OpName,
    ProjectId, ReleasedLink, Result, RevisionsPage, Task, TaskKey, TaskList, TaskMany, TaskPatch,
    TaskStats, Updated, close_task, close_task_detailed, count_epic_children_by_status,
    create_task, get_task, list_tasks, update_task, validate_limit, validate_offset, warnings_for,
};

use crate::{Ctx, Kind, Op};

#[derive(Debug, Serialize, JsonSchema)]
pub struct BatchError {
    pub kind: xboct_log_core::AppErrorKind,
    pub message: String,
}

#[derive(Debug, Serialize, JsonSchema)]
pub struct BatchOk {
    pub index: usize,
    pub id: Option<String>,
    pub ok: bool,
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
pub struct BatchFailure {
    pub index: usize,
    pub id: Option<String>,
    pub ok: bool,
    pub error: BatchError,
}

#[derive(Debug, Serialize, JsonSchema)]
#[serde(untagged)]
pub enum BatchItem {
    Ok(Box<BatchOk>),
    Failed(BatchFailure),
}

#[derive(Debug, Serialize, JsonSchema)]
pub struct BatchSummary {
    pub items: Vec<BatchItem>,
    pub succeeded: i64,
    pub failed: i64,
}

fn summary(items: Vec<BatchItem>) -> BatchSummary {
    let succeeded = items
        .iter()
        .filter(|item| matches!(item, BatchItem::Ok(_)))
        .count() as i64;
    let failed = items.len() as i64 - succeeded;
    BatchSummary {
        items,
        succeeded,
        failed,
    }
}

fn validate_items(count: usize) -> Result<()> {
    if (1..=100).contains(&count) {
        Ok(())
    } else {
        Err(AppError::validation(
            "items must contain between 1 and 100 entries",
        ))
    }
}

fn batch_error(index: usize, id: Option<&str>, error: &AppError) -> BatchItem {
    BatchItem::Failed(BatchFailure {
        index,
        id: id.map(str::to_string),
        ok: false,
        error: BatchError {
            kind: error.kind(),
            message: error.message().to_string(),
        },
    })
}

fn update_item(
    index: usize,
    id: &str,
    outcome: xboct_log_core::tasks::UpdateOutcome,
    warnings: Vec<String>,
) -> BatchItem {
    BatchItem::Ok(Box::new(BatchOk {
        index,
        id: Some(id.to_string()),
        ok: true,
        task: outcome.task,
        changes: outcome.changes,
        released: outcome.released,
        warnings,
        closed_epic: outcome.closed_epic,
        reopened_epic: outcome.reopened_epic,
    }))
}

mod batch;
mod extra;
mod lifecycle;
mod links;
mod query;
pub use batch::*;
pub use extra::*;
pub use lifecycle::*;
pub use links::*;
pub use query::*;
