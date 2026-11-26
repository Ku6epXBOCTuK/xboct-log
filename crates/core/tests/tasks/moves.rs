use super::*;

async fn create_plain_task(db: &Db, title: &str) -> String {
    let input: NewTask = serde_json::from_value(json!({
        "project_id": "log",
        "title": title,
    }))
    .unwrap();
    create_task(db, input)
        .await
        .unwrap()
        .task
        .id
        .as_str()
        .to_string()
}

#[tokio::test]
async fn moved_task_id_points_at_the_new_id() {
    let db = database().await;
    let old = create_plain_task(&db, "Movable").await;

    let moved = move_task(&db, &old, "spa").await.unwrap();
    let expected = format!(
        "task {old} not found - moved to {} in project spa",
        moved.id.as_str()
    );
    assert_ne!(moved.id.as_str(), old);

    let error = get_task(&db, &old).await.unwrap_err();
    assert_eq!(error.kind(), AppErrorKind::NotFound);
    assert_eq!(error.message(), expected);
    assert_eq!(
        resolve_task_id(&db, &old).await.unwrap_err().message(),
        expected
    );
}

#[tokio::test]
async fn move_history_follows_a_chain_of_moves() {
    let db = database().await;
    let old = create_plain_task(&db, "Travelling").await;

    let moved = move_task(&db, &old, "spa").await.unwrap();
    let final_task = move_task(&db, moved.id.as_str(), "log").await.unwrap();

    let error = resolve_task_id(&db, &old).await.unwrap_err();
    assert_eq!(
        error.message(),
        format!(
            "task {old} not found - moved to {} in project log",
            final_task.id.as_str()
        )
    );
}

#[tokio::test]
async fn moved_child_id_points_at_its_new_id() {
    let db = database().await;
    let epic_input: NewTask = serde_json::from_value(json!({
        "project_id": "log",
        "title": "Epic",
        "is_epic": true,
    }))
    .unwrap();
    let epic = create_task(&db, epic_input).await.unwrap();
    let child_input: NewTask = serde_json::from_value(json!({
        "project_id": "log",
        "title": "Child",
        "epic_id": epic.task.id.as_str(),
    }))
    .unwrap();
    let child = create_task(&db, child_input).await.unwrap();
    let old_child = child.task.id.as_str().to_string();
    let child_id: (String,) = sqlx::query_as("SELECT id FROM tasks WHERE key = ?")
        .bind(&old_child)
        .fetch_one(db.pool())
        .await
        .unwrap();

    move_task(&db, epic.task.id.as_str(), "spa").await.unwrap();
    let new_child: (String,) = sqlx::query_as("SELECT key FROM tasks WHERE id = ?")
        .bind(&child_id.0)
        .fetch_one(db.pool())
        .await
        .unwrap();

    let error = resolve_task_id(&db, &old_child).await.unwrap_err();
    assert_eq!(
        error.message(),
        format!(
            "task {old_child} not found - moved to {} in project spa",
            new_child.0
        )
    );
}

#[tokio::test]
async fn deleted_moved_task_mentions_its_new_id() {
    let db = database().await;
    let old = create_plain_task(&db, "Deleted").await;
    let moved = move_task(&db, &old, "spa").await.unwrap();

    delete_task(&db, moved.id.as_str()).await.unwrap();

    let error = resolve_task_id(&db, &old).await.unwrap_err();
    assert_eq!(
        error.message(),
        format!(
            "task {old} not found - moved to {} in project spa (task is deleted)",
            moved.id.as_str()
        )
    );
}
