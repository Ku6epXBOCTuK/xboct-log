use std::collections::HashMap;

use sqlx::{QueryBuilder, Sqlite};

use crate::ids::{ProjectId, ScopeId, Seq, TagName, TaskKey};
use crate::plans::PlanRef;
use crate::{AppError, Db, Limit, Offset, Result, fetch::fetch_by_id};

use super::filters::{LinkFilter, Sort, TaskFilters};
use super::model::{
    BlockingInfo, Estimate, Priority, Status, Task, TaskList, TaskListEntry, TaskRow, TaskView,
};
use super::resolve::{normalize_task_id_input, resolve_task_id};
use crate::query::{FieldSelection, push_in_text, push_like};

const SEARCH_COLUMNS: [&str; 4] = [
    "ULOWER(tasks.title)",
    "ULOWER(tasks.description)",
    "ULOWER(tasks.key)",
    "ULOWER((SELECT key FROM tasks epic WHERE epic.id = tasks.epic_id))",
];

fn push_and(qb: &mut QueryBuilder<Sqlite>, first: &mut bool) {
    if *first {
        *first = false;
        qb.push(" WHERE ");
    } else {
        qb.push(" AND ");
    }
}

fn push_in_int(qb: &mut QueryBuilder<Sqlite>, column: &str, values: &[i64]) {
    qb.push(column).push(" IN (");
    let mut separated = qb.separated(", ");
    for value in values {
        separated.push_bind(*value);
    }
    separated.push_unseparated(")");
}

fn push_search(qb: &mut QueryBuilder<Sqlite>, term: &str) {
    qb.push("(");
    for (index, column) in SEARCH_COLUMNS.iter().enumerate() {
        if index > 0 {
            qb.push(" OR ");
        }
        push_like(qb, column, term);
    }
    qb.push(" OR EXISTS (SELECT 1 FROM task_tags tt WHERE tt.task_id = tasks.id AND ");
    push_like(qb, "ULOWER(tt.tag)", term);
    qb.push("))");
}

fn exact_values(filters: &TaskFilters) -> (Vec<i64>, Vec<String>) {
    let numbers = filters
        .number_exact
        .as_deref()
        .unwrap_or_default()
        .iter()
        .map(|value| value.get())
        .collect();
    let ids = filters
        .id_exact
        .as_deref()
        .unwrap_or_default()
        .iter()
        .map(|value| normalize_task_id_input(value.as_str().trim()).to_lowercase())
        .filter(|value| !value.is_empty())
        .collect();
    (numbers, ids)
}

fn push_exact(qb: &mut QueryBuilder<Sqlite>, filters: &TaskFilters) -> bool {
    let (numbers, ids) = exact_values(filters);
    if numbers.is_empty() && ids.is_empty() {
        return false;
    }
    qb.push("(");
    let mut first = true;
    if !numbers.is_empty() {
        push_in_int(qb, "tasks.number", &numbers);
        first = false;
    }
    if !ids.is_empty() {
        if !first {
            qb.push(" OR ");
        }
        push_in_text(qb, "ULOWER(tasks.key)", &ids);
    }
    qb.push(")");
    true
}

fn push_task_ref(qb: &mut QueryBuilder<Sqlite>, value: &str) {
    qb.push_bind(normalize_task_id_input(value.trim()));
}

fn push_blocking_filter(qb: &mut QueryBuilder<Sqlite>, column: &str, value: &str) {
    let (source, target) = if column == "blocked_by" {
        ("source_task_id", "target_task_id")
    } else {
        ("target_task_id", "source_task_id")
    };
    qb.push("tasks.key IN (SELECT t.key FROM tasks t WHERE t.id IN (SELECT ")
        .push(target)
        .push(" FROM task_links WHERE link_type = 'blocks' AND ")
        .push(source)
        .push(" IN (SELECT id FROM tasks WHERE key = ");
    push_task_ref(qb, value);
    qb.push(" AND deleted_at IS NULL)))");
}

fn push_where(qb: &mut QueryBuilder<Sqlite>, filters: &TaskFilters) {
    let mut first = true;

    if filters.deleted_only == Some(true) {
        push_and(qb, &mut first);
        qb.push("tasks.deleted_at IS NOT NULL");
    } else if filters.include_deleted != Some(true) {
        push_and(qb, &mut first);
        qb.push("tasks.deleted_at IS NULL");
    }

    if let Some(values) = &filters.project_id {
        push_and(qb, &mut first);
        push_in_text(
            qb,
            "tasks.project_id COLLATE NOCASE",
            &values.clone().into_vec(),
        );
    }
    if let Some(values) = &filters.exclude_project_id {
        push_and(qb, &mut first);
        qb.push("tasks.project_id COLLATE NOCASE NOT IN (");
        let mut separated = qb.separated(", ");
        for value in values.clone().into_vec() {
            separated.push_bind(value.into_string());
        }
        separated.push_unseparated(")");
    }
    if let Some(values) = &filters.status {
        push_and(qb, &mut first);
        let values: Vec<String> = values
            .clone()
            .into_vec()
            .into_iter()
            .map(|value| value.as_str().to_string())
            .collect();
        push_in_text(qb, "tasks.status", &values);
    }
    if filters.hide_closed() {
        push_and(qb, &mut first);
        qb.push("tasks.status NOT IN ('done', 'cancelled')");
    }
    if let Some(values) = &filters.priority {
        push_and(qb, &mut first);
        let values: Vec<String> = values
            .clone()
            .into_vec()
            .into_iter()
            .map(|value| value.as_str().to_string())
            .collect();
        push_in_text(qb, "tasks.priority", &values);
    }
    if let Some(values) = &filters.estimate {
        push_and(qb, &mut first);
        let values: Vec<String> = values
            .clone()
            .into_vec()
            .into_iter()
            .map(|value| value.as_str().to_string())
            .collect();
        push_in_text(qb, "tasks.estimate", &values);
    }
    if let Some(values) = &filters.assignee {
        push_and(qb, &mut first);
        let values: Vec<String> = values
            .clone()
            .into_vec()
            .into_iter()
            .map(|value| value.to_lowercase())
            .collect();
        push_in_text(qb, "ULOWER(tasks.assignee)", &values);
    }
    if let Some(due_before) = &filters.due_before {
        push_and(qb, &mut first);
        qb.push("tasks.due_at IS NOT NULL AND tasks.due_at < ")
            .push_bind(due_before.clone());
    }
    if let Some(due_after) = &filters.due_after {
        push_and(qb, &mut first);
        qb.push("tasks.due_at IS NOT NULL AND tasks.due_at >= ")
            .push_bind(due_after.clone());
    }
    if let Some(is_epic) = filters.is_epic {
        push_and(qb, &mut first);
        qb.push("tasks.is_epic = ").push_bind(i64::from(is_epic));
    }
    match &filters.epic_id {
        LinkFilter::Any => {}
        LinkFilter::Null => {
            push_and(qb, &mut first);
            qb.push("tasks.epic_id IS NULL");
        }
        LinkFilter::Values(values) => {
            let refs: Vec<String> = values
                .iter()
                .map(|value| normalize_task_id_input(value.as_str().trim()))
                .collect();
            if !refs.is_empty() {
                push_and(qb, &mut first);
                qb.push("tasks.epic_id IN (SELECT id FROM tasks epic WHERE epic.key IN (");
                let mut separated = qb.separated(", ");
                for value in refs {
                    separated.push_bind(value);
                }
                separated.push_unseparated("))");
            }
        }
    }
    match &filters.scope_id {
        LinkFilter::Any => {}
        LinkFilter::Null => {
            push_and(qb, &mut first);
            qb.push("tasks.scope_id IS NULL");
        }
        LinkFilter::Values(values) => {
            let values: Vec<i64> = values.iter().map(|value| value.get()).collect();
            if !values.is_empty() {
                push_and(qb, &mut first);
                push_in_int(qb, "tasks.scope_id", &values);
            }
        }
    }
    if let Some(has_epic) = filters.has_epic {
        push_and(qb, &mut first);
        qb.push(if has_epic {
            "tasks.epic_id IS NOT NULL"
        } else {
            "tasks.epic_id IS NULL"
        });
    }
    if let Some(plan_id) = &filters.plan_id {
        push_and(qb, &mut first);
        qb.push("EXISTS (SELECT 1 FROM plan_items pi JOIN plans p ON p.id = pi.plan_id WHERE pi.task_id = tasks.id AND pi.plan_id = ")
            .push_bind(plan_id.clone())
            .push(" AND p.deleted_at IS NULL)");
    }
    if let Some(has_plan) = filters.has_plan {
        push_and(qb, &mut first);
        qb.push(if has_plan {
            "EXISTS (SELECT 1 FROM plan_items pi JOIN plans p ON p.id = pi.plan_id WHERE pi.task_id = tasks.id AND p.deleted_at IS NULL)"
        } else {
            "NOT EXISTS (SELECT 1 FROM plan_items pi JOIN plans p ON p.id = pi.plan_id WHERE pi.task_id = tasks.id AND p.deleted_at IS NULL)"
        });
    }
    if let Some(has_scope) = filters.has_scope {
        push_and(qb, &mut first);
        qb.push(if has_scope {
            "tasks.scope_id IS NOT NULL"
        } else {
            "tasks.scope_id IS NULL"
        });
    }
    if let Some(has_tags) = filters.has_tags {
        push_and(qb, &mut first);
        qb.push(if has_tags {
            "EXISTS (SELECT 1 FROM task_tags tt WHERE tt.task_id = tasks.id)"
        } else {
            "NOT EXISTS (SELECT 1 FROM task_tags tt WHERE tt.task_id = tasks.id)"
        });
    }
    if let Some(value) = &filters.blocked_by {
        push_and(qb, &mut first);
        push_blocking_filter(qb, "blocked_by", value.as_str());
    }
    if let Some(value) = &filters.blocks {
        push_and(qb, &mut first);
        push_blocking_filter(qb, "blocks", value.as_str());
    }
    if let Some(values) = &filters.tag {
        push_and(qb, &mut first);
        let tags: Vec<String> = values
            .clone()
            .into_vec()
            .into_iter()
            .map(|value| value.as_str().to_lowercase())
            .collect();
        qb.push("EXISTS (SELECT 1 FROM task_tags tt WHERE tt.task_id = tasks.id AND ULOWER(tt.tag) IN (");
        let mut separated = qb.separated(", ");
        for tag in tags {
            separated.push_bind(tag);
        }
        separated.push_unseparated("))");
    }
    if let Some(term) = &filters.q {
        push_and(qb, &mut first);
        push_search(qb, term);
    }
    if let Some(terms) = &filters.q_any {
        let terms: Vec<&str> = terms
            .iter()
            .map(|term| term.trim())
            .filter(|term| !term.is_empty())
            .collect();
        push_and(qb, &mut first);
        if terms.is_empty() {
            qb.push("0");
        } else {
            qb.push("(");
            for (index, term) in terms.iter().enumerate() {
                if index > 0 {
                    qb.push(" OR ");
                }
                qb.push("(");
                push_search(qb, term);
                let (numbers, ids) = exact_values(filters);
                if !numbers.is_empty() || !ids.is_empty() {
                    qb.push(" OR ");
                    push_exact(qb, filters);
                }
                qb.push(")");
            }
            qb.push(")");
        }
    }
    let exact_only = filters.q.is_none() && filters.q_any.is_none();
    if exact_only && (filters.number_exact.is_some() || filters.id_exact.is_some()) {
        push_and(qb, &mut first);
        if !push_exact(qb, filters) {
            qb.push("0");
        }
    }
    if let Some(title) = &filters.title {
        push_and(qb, &mut first);
        push_like(qb, "ULOWER(tasks.title)", title);
    }
    if let Some(title) = &filters.title_exact {
        push_and(qb, &mut first);
        qb.push("ULOWER(tasks.title) = ULOWER(")
            .push_bind(title.clone())
            .push(")");
    }
    if let Some(source_file) = &filters.source_file {
        push_and(qb, &mut first);
        push_like(qb, "ULOWER(tasks.source_file)", source_file);
    }
    if let Some(project_archived) = filters.project_archived {
        push_and(qb, &mut first);
        qb.push(if project_archived {
            "projects.archived_at IS NOT NULL"
        } else {
            "projects.archived_at IS NULL"
        });
    }
}

fn push_from(qb: &mut QueryBuilder<Sqlite>, filters: &TaskFilters) {
    if filters.include_project == Some(true) || filters.project_archived.is_some() {
        qb.push(" LEFT JOIN projects ON tasks.project_id = projects.id");
    }
    if filters.include_scope == Some(true) {
        qb.push(" LEFT JOIN scopes ON tasks.scope_id = scopes.id");
    }
}

fn push_order(qb: &mut QueryBuilder<Sqlite>, filters: &TaskFilters) {
    let order = if filters.descending() { "DESC" } else { "ASC" };
    let (numbers, ids) = exact_values(filters);
    qb.push(" ORDER BY ");
    if !numbers.is_empty() || !ids.is_empty() {
        qb.push("CASE WHEN ");
        push_exact(qb, filters);
        qb.push(" THEN 0 ELSE 1 END, ");
    }
    match filters.sort() {
        Sort::Priority => {
            qb.push(
				"CASE tasks.priority WHEN 'low' THEN 3 WHEN 'medium' THEN 2 WHEN 'high' THEN 1 WHEN 'critical' THEN 0 ELSE 99 END ",
			)
			.push(order)
			.push(", tasks.updated_at DESC, tasks.key ASC");
        }
        Sort::Status => {
            qb.push(
				"CASE tasks.status WHEN 'backlog' THEN 0 WHEN 'open' THEN 1 WHEN 'in-progress' THEN 2 WHEN 'blocked' THEN 3 WHEN 'done' THEN 4 WHEN 'cancelled' THEN 5 ELSE 99 END ",
			)
			.push(order)
			.push(", tasks.key ASC");
        }
        Sort::Project => {
            qb.push("(SELECT name FROM projects WHERE id = tasks.project_id) ")
                .push(order)
                .push(", tasks.number ASC, tasks.key ASC");
        }
        Sort::Number => {
            qb.push("tasks.number ")
                .push(order)
                .push(", tasks.project_id ASC, tasks.key ASC");
        }
        Sort::Title => {
            qb.push("ULOWER(tasks.title) ")
                .push(order)
                .push(", tasks.key ASC");
        }
        Sort::PlanPosition => {
            qb.push("(SELECT pi.position FROM plan_items pi WHERE pi.task_id = tasks.id AND pi.plan_id = ")
                .push_bind(filters.plan_id.clone().unwrap_or_default())
                .push(") ")
                .push(order)
                .push(", tasks.key ASC");
        }
        Sort::ClosedAt => {
            qb.push("(tasks.closed_at IS NULL) ASC, tasks.closed_at ")
                .push(order)
                .push(", tasks.key ASC");
        }
        Sort::CreatedAt => {
            qb.push("tasks.created_at ")
                .push(order)
                .push(", tasks.key ASC");
        }
        Sort::UpdatedAt => {
            qb.push("tasks.updated_at ")
                .push(order)
                .push(", tasks.key ASC");
        }
    }
}

mod fields;
mod rows;
pub use fields::{count_epic_children_by_status, get_task, list_tasks};
#[cfg(test)]
pub(crate) use fields::{description_preview, parse_fields, pick_fields};
pub(crate) use fields::{list_tasks_unchecked, task_by_key};
pub(crate) use rows::{
    blocking_info_for, plan_ids_for, plan_names_for, row_to_task, tags_for_tasks,
};

#[cfg(test)]
mod tests;
