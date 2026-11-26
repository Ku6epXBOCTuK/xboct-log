use super::*;

#[tokio::test]
async fn streams_sync_change_and_reset_over_sse() {
    use xboct_log_core::{ActivitySource, Entity};

    let app = test_app().await;
    let request = Request::builder()
        .method(Method::GET)
        .uri("/api/events")
        .body(Body::empty())
        .unwrap();
    let response = app.router.clone().oneshot(request).await.unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let headers = response.headers();
    assert_eq!(header(headers, "content-type"), "text/event-stream");
    assert_eq!(header(headers, "cache-control"), "no-cache, no-transform");
    assert_eq!(header(headers, "connection"), "keep-alive");
    assert_eq!(header(headers, "x-accel-buffering"), "no");

    let mut stream = response.into_body().into_data_stream();
    assert_eq!(
        next_frame(&mut stream).await,
        "event: sync\ndata: {\"seq\":0}\n\n"
    );

    app.state
        .events
        .publish_change(Entity::Tasks, "tasks_update", ActivitySource::Ui, None);
    assert_eq!(
        next_frame(&mut stream).await,
        "event: change\ndata: {\"seq\":1,\"entity\":\"tasks\",\"op\":\"tasks_update\",\"source\":\"ui\",\"client\":null}\n\n"
    );

    app.state.events.publish_reset();
    assert_eq!(next_frame(&mut stream).await, "event: reset\ndata: {}\n\n");

    drop(stream);
    app.stop().await;
}

#[tokio::test]
async fn resyncs_a_lagged_sse_client_without_reloading_the_app() {
    use xboct_log_core::{ActivitySource, Entity};

    let app = test_app_with_events(Events::with_capacity(2)).await;
    let request = Request::builder()
        .method(Method::GET)
        .uri("/api/events")
        .body(Body::empty())
        .unwrap();
    let response = app.router.clone().oneshot(request).await.unwrap();
    let mut stream = response.into_body().into_data_stream();

    assert_eq!(
        next_frame(&mut stream).await,
        "event: sync\ndata: {\"seq\":0}\n\n"
    );

    for _ in 0..3 {
        app.state
            .events
            .publish_change(Entity::Tasks, "tasks_update", ActivitySource::Ui, None);
    }

    assert_eq!(
        next_frame(&mut stream).await,
        "event: sync\ndata: {\"seq\":3}\n\n"
    );
    assert_eq!(
        next_frame(&mut stream).await,
        "event: change\ndata: {\"seq\":2,\"entity\":\"tasks\",\"op\":\"tasks_update\",\"source\":\"ui\",\"client\":null}\n\n"
    );
    assert_eq!(
        next_frame(&mut stream).await,
        "event: change\ndata: {\"seq\":3,\"entity\":\"tasks\",\"op\":\"tasks_update\",\"source\":\"ui\",\"client\":null}\n\n"
    );

    app.state.events.publish_reset();
    assert_eq!(next_frame(&mut stream).await, "event: reset\ndata: {}\n\n");

    drop(stream);
    app.stop().await;
}

async fn next_frame(stream: &mut axum::body::BodyDataStream) -> String {
    use futures_util::StreamExt;

    let frame = tokio::time::timeout(Duration::from_secs(5), stream.next())
        .await
        .expect("no sse frame within 5 s")
        .expect("the sse stream ended")
        .expect("the sse frame failed");
    String::from_utf8(frame.to_vec()).unwrap()
}
