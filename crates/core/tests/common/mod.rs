use serde::Serialize;
use serde_json::Value;

pub fn jsonv<T: Serialize>(value: T) -> Value {
    serde_json::to_value(value).expect("json")
}
