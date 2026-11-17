use serde_json::{Value, json};
use xboct_log_core::OpName;

pub(crate) fn describe_ops(schema: &mut Value) {
    let Some(op) = schema
        .get_mut("properties")
        .and_then(Value::as_object_mut)
        .and_then(|properties| properties.get_mut("op"))
        .and_then(Value::as_object_mut)
    else {
        return;
    };
    let names: Vec<&'static str> = OpName::ALL.iter().map(|name| name.as_str()).collect();
    op.insert("enum".to_string(), json!(names));
}
