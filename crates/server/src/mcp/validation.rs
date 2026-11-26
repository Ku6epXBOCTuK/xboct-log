use super::*;

pub(crate) fn internal(error: AppError) -> McpError {
    McpError::internal_error(error.message().to_string(), None)
}

pub(crate) fn client_label(context: &RequestContext<RoleServer>) -> Option<String> {
    let info = context.client_info()?;
    let label = if info.version.is_empty() {
        info.name.clone()
    } else {
        format!("{}/{}", info.name, info.version)
    };
    let mut printable = String::with_capacity(label.len());
    let mut spaced = false;
    for character in label.chars() {
        let code = character as u32;
        if code < 0x20 || code == 0x7f {
            if !spaced {
                printable.push(' ');
                spaced = true;
            }
        } else {
            printable.push(character);
            spaced = false;
        }
    }
    let trimmed = printable.split_whitespace().collect::<Vec<_>>().join(" ");
    if trimmed.is_empty() {
        return None;
    }
    let mut units = 0;
    let mut cut = trimmed.len();
    for (index, character) in trimmed.char_indices() {
        units += character.len_utf16();
        if units > CLIENT_LABEL_MAX_LENGTH {
            cut = index;
            break;
        }
    }
    Some(trimmed[..cut].to_string())
}

pub(crate) fn validation_error(name: &str, arguments: &Value) -> Option<String> {
    let schema = tool_schema(name)?.0;
    let properties = schema.get("properties")?.as_object()?;
    let object = arguments.as_object()?;
    if let Err(error) = ops_validation::validate_arguments(name, arguments) {
        return Some(format!(
            "Input validation error: Invalid arguments for tool {name}: {}",
            error.message()
        ));
    }

    let mut problems = Vec::new();
    for (key, property) in properties {
        let Some(value) = object.get(key) else {
            continue;
        };
        if value.is_null() {
            continue;
        }
        let Some(options) = deref(property, &schema)
            .get("enum")
            .and_then(Value::as_array)
        else {
            continue;
        };
        if options.iter().any(|option| option == value) {
            continue;
        }
        let rendered: Vec<String> = options
            .iter()
            .map(|option| format!("\"{}\"", option.as_str().unwrap_or_default()))
            .collect();
        problems.push(format!(
            "{key}: Invalid option: expected one of {}",
            rendered.join("|")
        ));
    }
    if let Some(required) = schema.get("required").and_then(Value::as_array) {
        for field in required {
            let Some(key) = field.as_str() else {
                continue;
            };
            if object.contains_key(key) {
                continue;
            }
            let Some(property) = properties.get(key).map(|property| deref(property, &schema))
            else {
                continue;
            };
            if property.get("default").is_some() {
                continue;
            }
            problems.push(format!(
                "{key}: Invalid input: expected {}, received undefined",
                expected_type(property)
            ));
        }
    }
    if problems.is_empty() {
        return None;
    }
    Some(format!(
        "Input validation error: Invalid arguments for tool {name}: {}",
        problems.join("; ")
    ))
}

pub(crate) fn expected_type(schema: &Value) -> &str {
    match schema.get("type") {
        Some(Value::String(name)) => name,
        Some(Value::Array(names)) => names
            .iter()
            .filter_map(Value::as_str)
            .find(|name| *name != "null")
            .unwrap_or("value"),
        _ => match schema.get("anyOf").and_then(Value::as_array) {
            Some(variants) => variants
                .iter()
                .find(|variant| variant.get("type").and_then(Value::as_str) != Some("null"))
                .map(expected_type)
                .unwrap_or("value"),
            None => "value",
        },
    }
}

pub(crate) fn normalize_arguments(name: &str, arguments: Value) -> Value {
    let mut arguments = match arguments {
        Value::Object(map) => map,
        other => return other,
    };
    if name == "tasks_update_many" {
        if let Some(Value::Array(items)) = arguments.get_mut("items") {
            for item in items {
                if let Value::Object(item) = item {
                    flatten_patch(item, patch_fields("tasks_update"));
                }
            }
        }
        return Value::Object(arguments);
    }
    flatten_patch(&mut arguments, patch_fields(name));
    Value::Object(arguments)
}

pub(crate) fn flatten_patch(arguments: &mut Map<String, Value>, fields: &[&str]) {
    let keys: Vec<String> = arguments
        .keys()
        .filter(|key| fields.contains(&key.as_str()))
        .cloned()
        .collect();
    let mut flat = Map::new();
    for key in keys {
        if let Some(value) = arguments.shift_remove(&key) {
            flat.insert(key, value);
        }
    }
    if flat.is_empty() {
        return;
    }
    match arguments.get_mut("patch") {
        Some(Value::Object(patch)) => {
            for (key, value) in flat {
                patch.entry(key).or_insert(value);
            }
        }
        _ => {
            arguments.insert("patch".to_string(), Value::Object(flat));
        }
    }
}
