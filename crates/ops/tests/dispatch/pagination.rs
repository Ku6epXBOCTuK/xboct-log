use super::*;

async fn seed(ctx: &Ctx) {
    dispatch(
        ctx,
        "projects_create",
        json!({"project_id": "log", "name": "Log", "prefix": "LOG"}),
    )
    .await
    .unwrap();
    for number in 1..=60 {
        dispatch(
            ctx,
            "tasks_create",
            json!({
                "project_id": "log",
                "title": format!("Task {number}"),
                "description": "x".repeat(4_000),
            }),
        )
        .await
        .unwrap();
    }
}

#[tokio::test]
async fn ui_first_page_has_fifty_items_even_with_long_descriptions() {
    let mut ctx = context().await;
    seed(&ctx).await;
    ctx.source = ActivitySource::Ui;

    let page = dispatch(&ctx, "tasks_list", json!({"page": 1}))
        .await
        .unwrap();

    assert_eq!(page["total"], 60);
    assert_eq!(page["offset"], 0);
    assert_eq!(page["page_size"], 50);
    assert_eq!(page["size"], 50);
    assert_eq!(page["items"].as_array().unwrap().len(), 50);
    assert_eq!(page["next_offset"], 50);
}

#[tokio::test]
async fn ui_pages_are_bounded_by_the_server_page_size_and_have_no_description() {
    let mut ctx = context().await;
    seed(&ctx).await;
    ctx.source = ActivitySource::Ui;

    let page = dispatch(&ctx, "tasks_list", json!({"page": 2}))
        .await
        .unwrap();

    assert_eq!(page["total"], 60);
    assert_eq!(page["offset"], 50);
    assert_eq!(page["page_size"], 50);
    assert_eq!(page["size"], 10);
    assert_eq!(page["items"].as_array().unwrap().len(), 10);
    assert!(page["items"][0].get("description").is_none());
    assert!(page["items"][0].get("short_description").is_none());
    assert!(serde_json::to_string(&page).unwrap().len() < 24 * 1024);
}

#[tokio::test]
async fn mcp_keeps_its_own_pagination_and_budget() {
    let mut ctx = context().await;
    seed(&ctx).await;
    ctx.source = ActivitySource::Mcp;

    let page = dispatch(
        &ctx,
        "tasks_list",
        json!({"limit": 100, "include_description": true}),
    )
    .await
    .unwrap();

    assert_eq!(page["offset"], 0);
    assert_eq!(page["page_size"], 100);
    let size = page["size"].as_u64().unwrap();
    assert!(size > 0 && size < 60);
    assert_eq!(page["next_offset"], size);
    assert_eq!(page["items"].as_array().unwrap().len() as u64, size);
    assert!(page["items"][0].get("description").is_some());
}

#[tokio::test]
async fn mcp_budget_applies_to_any_list_response() {
    let mut ctx = context().await;
    dispatch(
        &ctx,
        "projects_create",
        json!({"project_id": "log", "name": "Log", "prefix": "LOG"}),
    )
    .await
    .unwrap();
    for number in 1..=30 {
        dispatch(
            &ctx,
            "documents_create",
            json!({
                "project_id": "log",
                "kind": "adr",
                "title": format!("Doc {number}"),
                "body": "x".repeat(2_000)
            }),
        )
        .await
        .unwrap();
    }
    ctx.source = ActivitySource::Mcp;

    let page = dispatch(
        &ctx,
        "documents_list",
        json!({"include_body": true, "limit": 100}),
    )
    .await
    .unwrap();

    let size = page["items"].as_array().unwrap().len();
    assert!(size > 0 && size < 30);
    assert!(serde_json::to_string(&page).unwrap().len() <= 24 * 1024);
}
