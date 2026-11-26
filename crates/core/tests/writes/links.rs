use super::*;

#[tokio::test]
async fn links_tasks_and_releases_blockers() {
    let db = open().await;
    for title in ["One", "Two", "Three"] {
        create_task(&db, new_task(json!({"project_id": "log", "title": title})))
            .await
            .expect("create");
    }

    add_link(&db, LinkType::RelatesTo, "LOG-1", "LOG-2")
        .await
        .expect("relate");
    let first = get_task(&db, "LOG-1").await.expect("read first");
    assert_eq!(first.relates_to, vec!["LOG-2"]);
    let second = get_task(&db, "LOG-2").await.expect("read second");
    assert_eq!(second.relates_to, vec!["LOG-1"]);

    add_link(&db, LinkType::Duplicates, "LOG-1", "LOG-3")
        .await
        .expect("duplicate");
    let cycle = add_link(&db, LinkType::Duplicates, "LOG-3", "LOG-1")
        .await
        .expect_err("cycle");
    assert_eq!(
        cycle.message(),
        "duplicates cycle: LOG-1 already duplicates LOG-3"
    );

    let itself = add_link(&db, LinkType::RelatesTo, "LOG-1", "LOG-1")
        .await
        .expect_err("self");
    assert_eq!(itself.message(), "a task cannot relates to itself");

    update_task(&db, "LOG-1", patch(json!({"status": "blocked"})))
        .await
        .expect("block");
    add_blocker(&db, "LOG-1", "LOG-2").await.expect("blocker");
    let blocked = get_task(&db, "LOG-1").await.expect("read blocked");
    assert_eq!(blocked.blocked_by, vec!["LOG-2"]);

    remove_blocker(&db, "LOG-1", "LOG-2")
        .await
        .expect("release");
    let released = get_task(&db, "LOG-1").await.expect("read released");
    assert!(released.blocked_by.is_empty());
    assert_eq!(released.status, Status::Backlog);

    let missing = remove_link(&db, LinkType::RelatesTo, "LOG-1", "LOG-3")
        .await
        .expect_err("missing");
    assert_eq!(
        missing.message(),
        "no relates_to link between LOG-1 and LOG-3"
    );
}

#[tokio::test]
async fn an_open_blocker_blocks_the_task_and_its_dependents() {
    let db = open().await;
    for title in ["One", "Two", "Three"] {
        create_task(&db, new_task(json!({"project_id": "log", "title": title})))
            .await
            .expect("create");
    }

    add_blocker(&db, "LOG-2", "LOG-1").await.expect("blocker");
    assert_eq!(
        get_task(&db, "LOG-2").await.expect("read").status,
        Status::Blocked
    );

    add_blocker(&db, "LOG-3", "LOG-2")
        .await
        .expect("cascade blocker");
    assert_eq!(
        get_task(&db, "LOG-3").await.expect("read").status,
        Status::Blocked
    );

    let invalid = update_task(&db, "LOG-2", patch(json!({"status": "in-progress"})))
        .await
        .expect_err("in-progress");
    assert_eq!(
        invalid.message(),
        "task LOG-2 has open blocked_by [LOG-1]; finish the blockers first with tasks_close (reason fixed) or tasks_update status 'done' before setting status to 'in-progress'"
    );
}

#[tokio::test]
async fn a_closed_or_missing_blocker_does_not_block_and_done_is_not_reopened() {
    let db = open().await;
    for title in ["One", "Two", "Three"] {
        create_task(&db, new_task(json!({"project_id": "log", "title": title})))
            .await
            .expect("create");
    }
    update_task(&db, "LOG-1", patch(json!({"status": "done"})))
        .await
        .expect("done");
    add_blocker(&db, "LOG-2", "LOG-1").await.expect("blocker");
    assert_eq!(
        get_task(&db, "LOG-2").await.expect("read").status,
        Status::Backlog
    );

    update_task(&db, "LOG-3", patch(json!({"status": "cancelled"})))
        .await
        .expect("cancelled");
    add_blocker(&db, "LOG-3", "LOG-2").await.expect("blocker");
    assert_eq!(
        get_task(&db, "LOG-3").await.expect("read").status,
        Status::Cancelled
    );
}

#[tokio::test]
async fn updating_a_blocker_releases_and_reblocks_the_whole_chain() {
    let db = open().await;
    for title in ["One", "Two", "Three"] {
        create_task(&db, new_task(json!({"project_id": "log", "title": title})))
            .await
            .expect("create");
    }
    add_blocker(&db, "LOG-2", "LOG-1").await.expect("blocker");
    add_blocker(&db, "LOG-3", "LOG-2")
        .await
        .expect("cascade blocker");

    let done = jsonv(
        update_task(&db, "LOG-1", patch(json!({"status": "done"})))
            .await
            .expect("done"),
    );
    let released = done["released"].as_array().expect("released");
    assert_eq!(released.len(), 1);
    assert_eq!(released[0]["task_id"], "LOG-2");
    assert_eq!(released[0]["changes"][0]["to"], "backlog");
    assert_eq!(
        get_task(&db, "LOG-2").await.expect("read").status,
        Status::Backlog
    );
    assert_eq!(
        get_task(&db, "LOG-3").await.expect("read").status,
        Status::Blocked
    );

    let reopened = jsonv(
        update_task(&db, "LOG-1", patch(json!({"status": "open"})))
            .await
            .expect("reopen"),
    );
    assert_eq!(reopened["released"][0]["task_id"], "LOG-2");
    assert_eq!(reopened["released"][0]["changes"][0]["to"], "blocked");
    assert_eq!(
        get_task(&db, "LOG-2").await.expect("read").status,
        Status::Blocked
    );
    assert_eq!(
        get_task(&db, "LOG-3").await.expect("read").status,
        Status::Blocked
    );
}

#[tokio::test]
async fn closing_a_blocker_releases_its_dependent_and_keeps_the_links() {
    let db = open().await;
    for title in ["One", "Two", "Three"] {
        create_task(&db, new_task(json!({"project_id": "log", "title": title})))
            .await
            .expect("create");
    }
    add_blocker(&db, "LOG-2", "LOG-1").await.expect("blocker");
    add_blocker(&db, "LOG-3", "LOG-2")
        .await
        .expect("cascade blocker");

    let closed = jsonv(
        close_task(&db, "LOG-1", ClosedReason::Fixed)
            .await
            .expect("close"),
    );
    let released = closed["released"].as_array().expect("released");
    assert_eq!(released.len(), 1);
    assert_eq!(released[0]["task_id"], "LOG-2");
    assert_eq!(
        get_task(&db, "LOG-2").await.expect("read").blocked_by,
        vec!["LOG-1"]
    );
    assert_eq!(
        get_task(&db, "LOG-3").await.expect("read").status,
        Status::Blocked
    );
}

#[tokio::test]
async fn a_manual_block_with_an_external_reason_is_untouched_by_other_links() {
    let db = open().await;
    for title in ["One", "Two", "Three"] {
        create_task(&db, new_task(json!({"project_id": "log", "title": title})))
            .await
            .expect("create");
    }
    update_task(
        &db,
        "LOG-3",
        patch(json!({"status": "blocked", "blocked_reason": "waiting on a vendor"})),
    )
    .await
    .expect("manual block");
    add_blocker(&db, "LOG-2", "LOG-1").await.expect("blocker");
    remove_blocker(&db, "LOG-2", "LOG-1").await.expect("remove");

    let task = get_task(&db, "LOG-3").await.expect("read");
    assert_eq!(task.status, Status::Blocked);
    assert_eq!(task.blocked_reason.as_deref(), Some("waiting on a vendor"));
}
