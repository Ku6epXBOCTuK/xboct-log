use super::*;

pub(crate) fn row_to_task(row: TaskRow, tags: Vec<TagName>, blocking: BlockingInfo) -> Task {
    Task {
        id: TaskKey::from(row.key),
        project_id: ProjectId::from(row.project_id),
        number: Seq::from(row.number),
        title: row.title,
        description: Some(row.description),
        status: Status::from_db(&row.status).unwrap_or(Status::Backlog),
        priority: Priority::from_db(&row.priority).unwrap_or(Priority::Low),
        is_epic: row.is_epic == 1,
        epic_id: row.epic_key.map(TaskKey::from),
        scope_id: row.scope_id.map(ScopeId::from),
        source_file: row.source_file,
        tags,
        estimate: row.estimate.as_deref().and_then(Estimate::from_db),
        assignee: row.assignee,
        due_at: row.due_at,
        attachments_count: row.attachments_count,
        created_at: row.created_at,
        updated_at: row.updated_at,
        closed_at: row.closed_at,
        closed_reason: row.closed_reason,
        blocked_reason: row.blocked_reason,
        deleted_at: row.deleted_at,
        project_name: row.project_name,
        scope_name: row.scope_name,
        short_description: None,
        blocked_by: blocking.blocked_by,
        blocks: blocking.blocks,
        relates_to: blocking.relates_to,
        duplicates: blocking.duplicates,
        duplicated_by: blocking.duplicated_by,
        children_counts: None,
        plan_ids: Vec::new(),
        plan_names: None,
    }
}

pub(crate) async fn tags_for_tasks(
    db: &Db,
    keys: &[String],
) -> Result<HashMap<String, Vec<TagName>>> {
    let mut tags: HashMap<String, Vec<TagName>> = HashMap::new();
    if keys.is_empty() {
        return Ok(tags);
    }
    let mut qb = QueryBuilder::new(
        "SELECT tasks.key AS task_key, task_tags.tag FROM task_tags JOIN tasks ON tasks.id = task_tags.task_id WHERE tasks.key IN (",
    );
    let mut separated = qb.separated(", ");
    for key in keys {
        separated.push_bind(key.clone());
    }
    separated.push_unseparated(") ORDER BY task_tags.tag");
    let rows: Vec<(String, String)> = qb.build_query_as().fetch_all(db.pool()).await?;
    for (key, tag) in rows {
        tags.entry(key).or_default().push(TagName::from(tag));
    }
    Ok(tags)
}

pub(crate) async fn plan_ids_for(db: &Db, keys: &[String]) -> Result<HashMap<String, Vec<String>>> {
    let mut plans: HashMap<String, Vec<String>> = HashMap::new();
    if keys.is_empty() {
        return Ok(plans);
    }
    let mut qb = QueryBuilder::new(
        "SELECT tasks.key AS task_key, pi.plan_id FROM plan_items pi JOIN tasks ON tasks.id = pi.task_id JOIN plans ON plans.id = pi.plan_id WHERE plans.deleted_at IS NULL AND tasks.key IN (",
    );
    let mut separated = qb.separated(", ");
    for key in keys {
        separated.push_bind(key.clone());
    }
    separated.push_unseparated(") ORDER BY pi.plan_id");
    let rows: Vec<(String, String)> = qb.build_query_as().fetch_all(db.pool()).await?;
    for (key, plan_id) in rows {
        plans.entry(key).or_default().push(plan_id);
    }
    Ok(plans)
}

pub(crate) async fn plan_names_for(
    db: &Db,
    keys: &[String],
) -> Result<HashMap<String, Vec<PlanRef>>> {
    let mut plans: HashMap<String, Vec<PlanRef>> = HashMap::new();
    if keys.is_empty() {
        return Ok(plans);
    }
    let mut qb = QueryBuilder::new(
        "SELECT tasks.key AS task_key, plans.id, plans.name FROM plan_items pi JOIN tasks ON tasks.id = pi.task_id JOIN plans ON plans.id = pi.plan_id WHERE plans.deleted_at IS NULL AND tasks.key IN (",
    );
    let mut separated = qb.separated(", ");
    for key in keys {
        separated.push_bind(key.clone());
    }
    separated.push_unseparated(") ORDER BY plans.name, plans.id");
    let rows: Vec<(String, String, String)> = qb.build_query_as().fetch_all(db.pool()).await?;
    for (key, id, name) in rows {
        plans.entry(key).or_default().push(PlanRef { id, name });
    }
    Ok(plans)
}

pub(crate) async fn blocking_info_for(
    db: &Db,
    keys: &[String],
) -> Result<HashMap<String, BlockingInfo>> {
    let mut info: HashMap<String, BlockingInfo> = keys
        .iter()
        .map(|key| (key.clone(), BlockingInfo::default()))
        .collect();
    if keys.is_empty() {
        return Ok(info);
    }
    let mut qb = QueryBuilder::new(
        "SELECT l.link_type, source.key AS source_key, target.key AS target_key FROM task_links l JOIN tasks source ON source.id = l.source_task_id AND source.deleted_at IS NULL JOIN tasks target ON target.id = l.target_task_id AND target.deleted_at IS NULL WHERE target.key IN (",
    );
    let mut separated = qb.separated(", ");
    for key in keys {
        separated.push_bind(key.clone());
    }
    separated.push_unseparated(") OR source.key IN (");
    let mut separated = qb.separated(", ");
    for key in keys {
        separated.push_bind(key.clone());
    }
    separated.push_unseparated(")");
    let rows: Vec<(String, String, String)> = qb.build_query_as().fetch_all(db.pool()).await?;
    for (link_type, source, target) in rows {
        match link_type.as_str() {
            "blocks" => {
                if let Some(entry) = info.get_mut(&target) {
                    entry.blocked_by.push(TaskKey::from(source.clone()));
                }
                if let Some(entry) = info.get_mut(&source) {
                    entry.blocks.push(TaskKey::from(target.clone()));
                }
            }
            "relates_to" => {
                if let Some(entry) = info.get_mut(&source) {
                    entry.relates_to.push(TaskKey::from(target.clone()));
                }
                if let Some(entry) = info.get_mut(&target) {
                    entry.relates_to.push(TaskKey::from(source.clone()));
                }
            }
            "duplicates" => {
                if let Some(entry) = info.get_mut(&source) {
                    entry.duplicates.push(TaskKey::from(target.clone()));
                }
                if let Some(entry) = info.get_mut(&target) {
                    entry.duplicated_by.push(TaskKey::from(source.clone()));
                }
            }
            _ => {}
        }
    }
    for entry in info.values_mut() {
        entry.blocked_by.sort();
        entry.blocks.sort();
        entry.relates_to.sort();
        entry.duplicates.sort();
        entry.duplicated_by.sort();
    }
    Ok(info)
}
