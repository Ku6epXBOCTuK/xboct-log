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
        _ => Some(format!(
            "{}: {expected} expected, {actual} captured",
            if path.is_empty() { "<root>" } else { path }
        )),
    }
}
