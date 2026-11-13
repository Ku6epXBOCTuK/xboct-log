use serde_json::Value;

pub fn difference(expected: &Value, actual: &Value) -> Option<String> {
    walk("", expected, actual)
}

fn walk(path: &str, expected: &Value, actual: &Value) -> Option<String> {
    let at = |suffix: &str| {
        if path.is_empty() {
            suffix.to_owned()
        } else if suffix.is_empty() {
            path.to_owned()
        } else if suffix.starts_with('[') {
            format!("{path}{suffix}")
        } else {
            format!("{path}.{suffix}")
        }
    };
    match (expected, actual) {
        (Value::Object(left), Value::Object(right)) => {
            for (key, value) in left {
                match right.get(key) {
                    Some(other) => {
                        if let Some(found) = walk(&at(key), value, other) {
                            return Some(found);
                        }
                    }
                    None => return Some(format!("{}: missing", at(key))),
                }
            }
            for key in right.keys() {
                if !left.contains_key(key) {
                    return Some(format!("{}: unexpected", at(key)));
                }
            }
            None
        }
        (Value::Array(left), Value::Array(right)) => {
            if left.len() != right.len() {
                return Some(format!(
                    "{}: {} items expected, {} captured",
                    if path.is_empty() { "<root>" } else { path },
                    left.len(),
                    right.len()
                ));
            }
            for (index, (value, other)) in left.iter().zip(right).enumerate() {
                if let Some(found) = walk(&at(&format!("[{index}]")), value, other) {
                    return Some(found);
                }
            }
            None
        }
        (left, right) if left == right => None,
        (Value::String(expected), Value::String(actual)) if matches_now(expected, actual) => None,
        _ => Some(format!(
            "{}: {expected} expected, {actual} captured",
            if path.is_empty() { "<root>" } else { path }
        )),
    }
}

fn matches_now(expected: &str, actual: &str) -> bool {
    if !expected.contains(NOW) {
        return false;
    }
    let pattern = format!(
        "^{}$",
        regex::escape(expected).replace(NOW, TIMESTAMP_PATTERN)
    );
    regex::Regex::new(&pattern).is_ok_and(|regex| regex.is_match(actual))
}

const NOW: &str = "<now>";
const TIMESTAMP_PATTERN: &str = r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z";

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::difference;

    #[test]
    fn accepts_any_timestamp_where_the_snapshot_expects_now() {
        assert_eq!(
            difference(
                &json!({ "created_at": "<now>" }),
                &json!({ "created_at": "2020-01-01T00:00:00.000Z" })
            ),
            None
        );
        assert_eq!(
            difference(
                &json!({ "changes": "[{\"to\":\"<now>\"}]" }),
                &json!({ "changes": "[{\"to\":\"2020-01-01T00:00:00.000Z\"}]" })
            ),
            None
        );
        assert!(
            difference(
                &json!({ "created_at": "<now>" }),
                &json!({ "created_at": "yesterday" })
            )
            .is_some()
        );
    }
}
