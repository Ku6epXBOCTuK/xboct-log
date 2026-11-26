use super::*;

fn limit_maximum(schema: &serde_json::Value) -> serde_json::Value {
    let limit = &schema["properties"]["limit"];
    limit
        .get("maximum")
        .cloned()
        .or_else(|| {
            limit["anyOf"].as_array().and_then(|variants| {
                variants
                    .iter()
                    .find_map(|variant| variant.get("maximum").cloned())
            })
        })
        .unwrap_or(serde_json::Value::Null)
}

#[test]
fn request_log_limit_schemas_match_the_validation_bounds() {
    let (_, list, _) = xboct_log_ops::operation_schema("request_log_list").unwrap();
    assert_eq!(limit_maximum(&list), json!(200));
    let (_, export, _) = xboct_log_ops::operation_schema("request_log_export").unwrap();
    assert_eq!(limit_maximum(&export), json!(10000));
}
