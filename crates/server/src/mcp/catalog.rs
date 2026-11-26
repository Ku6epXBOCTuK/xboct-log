use super::*;

pub(crate) fn tool_catalog() -> Vec<OpInfo> {
    let mut infos: Vec<OpInfo> = metadata().into_iter().filter(|info| info.mcp).collect();
    infos.push(OpInfo {
        name: "attachments_read",
        kind: Kind::Query,
        mcp: true,
        lazy: true,
        description: mcp_text::ATTACHMENTS_READ_DESCRIPTION,
        entity: None,
    });
    infos
}

pub(crate) fn tool_names() -> Vec<(String, String)> {
    let mut names: Vec<(String, String)> = metadata()
        .into_iter()
        .filter(|info| info.mcp)
        .map(|info| (info.name.to_string(), summary(info.description)))
        .collect();
    names.push((
        "attachments_read".to_string(),
        summary(mcp_text::ATTACHMENTS_READ_DESCRIPTION),
    ));
    names.push((
        "xboct_log_tool_description".to_string(),
        summary(mcp_text::TOOL_DESCRIPTION_DESCRIPTION),
    ));
    names.push((
        "xboct_log_call".to_string(),
        summary(mcp_text::XBOCT_LOG_CALL_DESCRIPTION),
    ));
    names.sort_by(|left, right| left.0.cmp(&right.0));
    names
}

pub(crate) fn everyday_arguments() -> Vec<(String, String)> {
    let mut arguments = Vec::new();
    for info in metadata().into_iter().filter(|info| info.mcp && !info.lazy) {
        if let Some((input, _)) = tool_schema(info.name) {
            arguments.push((info.name.to_string(), format_arguments(&input)));
        }
    }
    arguments.sort_by(|left, right| left.0.cmp(&right.0));
    arguments
}

pub(crate) fn format_arguments(schema: &Value) -> String {
    let Some(properties) = schema.get("properties").and_then(Value::as_object) else {
        return "no arguments".to_string();
    };
    let required: Vec<&str> = schema
        .get("required")
        .and_then(Value::as_array)
        .map(|fields| fields.iter().filter_map(Value::as_str).collect())
        .unwrap_or_default();
    properties
        .iter()
        .map(|(name, property)| {
            let marker = if required.contains(&name.as_str()) {
                "required"
            } else {
                "optional"
            };
            format!("{}: {} [{}]", name, argument_type(property, schema), marker)
        })
        .collect::<Vec<_>>()
        .join(", ")
}

pub(crate) fn argument_type<'a>(schema: &'a Value, root: &'a Value) -> &'static str {
    let schema = deref(schema, root);
    if let Some(name) = schema
        .get("type")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
        .find(|name| *name != "null")
    {
        return primitive_type(name);
    }
    if let Some(name) = schema.get("type").and_then(Value::as_str) {
        return primitive_type(name);
    }
    let variants = schema
        .get("anyOf")
        .and_then(Value::as_array)
        .or_else(|| schema.get("oneOf").and_then(Value::as_array));
    if let Some(variants) = variants {
        for variant in variants {
            let name = argument_type(variant, root);
            if name != "value" {
                return name;
            }
        }
    }
    if schema.get("enum").is_some() {
        "enum"
    } else {
        "value"
    }
}

pub(crate) fn primitive_type(name: &str) -> &'static str {
    match name {
        "string" => "string",
        "integer" => "integer",
        "number" => "number",
        "boolean" => "boolean",
        "array" => "array",
        "object" => "object",
        _ => "value",
    }
}

pub(crate) fn summary(description: &str) -> String {
    let sentence = description.split(". ").next().unwrap_or(description);
    clip(sentence.trim().trim_end_matches(['.', ',', ' ']), 140)
}

pub(crate) fn catalog_entry(info: &OpInfo, tags_hint: &str) -> Option<CatalogEntry> {
    let (mut input, _) = match tool_schema(info.name) {
        Some(schema) => schema,
        None if info.name == "attachments_read" => {
            (schema_of::<ReadAttachmentInput>(), Value::Null)
        }
        None => return None,
    };
    let description = if needs_tags_hint(info.name) && !tags_hint.is_empty() {
        add_tags_hint(&mut input, tags_hint);
        format!("{}\n\n{}", info.description, tags_hint)
    } else {
        info.description.to_string()
    };
    Some(CatalogEntry {
        name: info.name.to_string(),
        description,
        params: catalog_params(&input),
    })
}

pub(crate) fn needs_tags_hint(name: &str) -> bool {
    matches!(
        name,
        "tasks_create" | "tasks_update" | "tasks_create_many" | "tasks_update_many"
    )
}

pub(crate) fn add_tags_hint(schema: &mut Value, hint: &str) {
    match schema {
        Value::Object(map) => {
            if let Some(properties) = map.get_mut("properties").and_then(Value::as_object_mut)
                && let Some(tags) = properties.get_mut("tags").and_then(Value::as_object_mut)
                && let Some(description) = tags.get("description").and_then(Value::as_str)
            {
                let augmented = format!("{description}\n\n{hint}");
                tags.insert("description".to_string(), Value::String(augmented));
            }
            for value in map.values_mut() {
                add_tags_hint(value, hint);
            }
        }
        Value::Array(items) => {
            for item in items {
                add_tags_hint(item, hint);
            }
        }
        _ => {}
    }
}

pub(crate) fn catalog_params(schema: &Value) -> Vec<CatalogParam> {
    let Some(properties) = schema.get("properties").and_then(Value::as_object) else {
        return Vec::new();
    };
    let required: Vec<&str> = schema
        .get("required")
        .and_then(Value::as_array)
        .map(|fields| fields.iter().filter_map(Value::as_str).collect())
        .unwrap_or_default();
    properties
        .iter()
        .map(|(name, property)| CatalogParam {
            name: name.clone(),
            required: required.contains(&name.as_str()),
            description: property
                .get("description")
                .and_then(Value::as_str)
                .map(|text| clip(text, 160))
                .unwrap_or_default(),
        })
        .collect()
}

pub(crate) fn brief_description(name: &str, description: &str) -> String {
    let sentence = summary(description);
    let sentence = sentence.trim_end_matches(['.', ',', ' ']);
    format!(
        "{sentence}. Get the argument schema with xboct_log_tool_description {{query: '{name}'}}."
    )
}

pub(crate) fn clip(text: &str, limit: usize) -> String {
    let mut clipped = String::new();
    for character in text.chars() {
        if clipped.len() + character.len_utf8() > limit {
            break;
        }
        clipped.push(character);
    }
    if clipped.len() < text.len() {
        clipped.push_str("...");
    }
    clipped
}

pub(crate) fn parse_schema(mut schema: Value) -> Arc<JsonObject> {
    if let Value::Object(map) = &mut schema {
        map.remove("$schema");
    }
    match schema {
        Value::Object(map) => Arc::new(map),
        _ => Arc::new(JsonObject::new()),
    }
}

pub(crate) fn deref<'a>(mut schema: &'a Value, root: &'a Value) -> &'a Value {
    loop {
        if let Some(reference) = schema.get("$ref").and_then(Value::as_str) {
            let Some(name) = reference.rsplit('/').next() else {
                return schema;
            };
            let Some(target) = root
                .get("$defs")
                .or_else(|| root.get("definitions"))
                .and_then(|defs| defs.get(name))
            else {
                return schema;
            };
            schema = target;
            continue;
        }
        let Some(variants) = schema.get("anyOf").and_then(Value::as_array) else {
            return schema;
        };
        let mut concrete = variants
            .iter()
            .filter(|variant| variant.get("type").and_then(Value::as_str) != Some("null"));
        let (Some(only), None) = (concrete.next(), concrete.next()) else {
            return schema;
        };
        schema = only;
    }
}
