use serde_json::{Value, json};
use xboct_log_core::{
    ClosedReason, Db, LinkType, NewTask, Status, TaskPatch, add_blocker, add_link, close_task,
    create_task, delete_task, get_task, move_task, remove_blocker, remove_link, restore_task,
    update_task,
};
async fn open() -> Db {
    let db = Db::open(":memory:").await.expect("open");
    db.migrate().await.expect("migrate");
    sqlx::query("INSERT INTO projects (id, prefix, name, created_at) VALUES ('log', 'LOG', 'Log', '2026-01-01T00:00:00.000Z')")
        .execute(db.pool())
        .await
        .expect("project");
    for tag in ["bug", "docs"] {
        sqlx::query("INSERT INTO tags (name, archived, created_at) VALUES (?, 0, '2026-01-01T00:00:00.000Z')")
            .bind(tag)
            .execute(db.pool())
            .await
            .expect("tag");
    }
    db
}

fn new_task(value: Value) -> NewTask {
    serde_json::from_value(value).expect("task input")
}

fn patch(value: Value) -> TaskPatch {
    serde_json::from_value(value).expect("patch")
}

#[path = "../common/mod.rs"]
mod common;

use common::jsonv;

mod create;
mod links;
