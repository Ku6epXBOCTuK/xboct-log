use serde::Deserialize;

use crate::{
    AppError, Result,
    ids::{ProjectId, ScopeId, Seq, TagName, TaskKey},
};

use super::model::{Estimate, Priority, Status};

#[derive(Debug, Clone, Deserialize)]
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

#[derive(Debug, Clone, Deserialize)]
#[serde(untagged)]
pub enum NullableList<T> {
    Null,
    Value(OneOrList<T>),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
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
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Order {
    Asc,
    Desc,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TaskFilters {
    pub project_id: Option<OneOrList<ProjectId>>,
    pub exclude_project_id: Option<OneOrList<ProjectId>>,
    pub status: Option<OneOrList<Status>>,
    pub priority: Option<OneOrList<Priority>>,
    pub estimate: Option<OneOrList<Estimate>>,
    pub assignee: Option<OneOrList<String>>,
    pub due_before: Option<String>,
    pub due_after: Option<String>,
    pub tag: Option<OneOrList<TagName>>,
    pub is_epic: Option<bool>,
    pub epic_id: Option<NullableList<TaskKey>>,
    pub scope_id: Option<NullableList<ScopeId>>,
    pub has_epic: Option<bool>,
    pub has_scope: Option<bool>,
    pub has_tags: Option<bool>,
    pub blocked_by: Option<TaskKey>,
    pub blocks: Option<TaskKey>,
    pub q: Option<String>,
    pub q_any: Option<Vec<String>>,
    pub number_exact: Option<Vec<Seq>>,
    pub id_exact: Option<Vec<TaskKey>>,
    pub title: Option<String>,
    pub title_exact: Option<String>,
    pub source_file: Option<String>,
    pub fields: Option<String>,
    pub include_description: Option<bool>,
    pub include_project: Option<bool>,
    pub include_scope: Option<bool>,
    pub project_archived: Option<bool>,
    pub sort: Option<Sort>,
    pub order: Option<Order>,
    pub include_deleted: Option<bool>,
    pub deleted_only: Option<bool>,
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
                Sort::Priority | Sort::Status | Sort::Project | Sort::Number | Sort::Title
            ),
        }
    }

    pub fn sort(&self) -> Sort {
        self.sort.unwrap_or(Sort::UpdatedAt)
    }
}
