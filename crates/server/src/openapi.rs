use serde_json::{Map, Value, json};
use xboct_log_ops::{metadata, operation_schema};

pub fn document() -> Value {
    let mut paths = Map::new();
    let mut defs = Map::new();
    for info in metadata() {
        let Some((_, input, output)) = operation_schema(info.name) else {
            continue;
        };
        paths.insert(
            format!("/api/{}", info.name),
            json!({
                "post": {
                    "operationId": info.name,
                    "summary": first_line(info.description),
                    "description": info.description,
                    "requestBody": {
                        "required": true,
                        "content": {"application/json": {"schema": prepare(input, &mut defs)}},
                    },
                    "responses": {
                        "200": {
                            "description": "The result of the operation",
                            "content": {"application/json": {"schema": prepare(output, &mut defs)}},
                        },
                        "400": error_response("The input is not valid"),
                        "404": error_response("The thing does not exist"),
                        "409": error_response("The change clashes with the current state"),
                        "500": error_response("The operation failed"),
                    },
                }
            }),
        );
    }

    let mut schemas = Map::new();
    schemas.insert(
        "Error".to_string(),
        json!({
            "type": "object",
            "properties": {
                "kind": {"type": "string"},
                "message": {"type": "string"},
            },
            "required": ["kind", "message"],
        }),
    );
    for (name, schema) in defs {
        schemas.entry(name).or_insert(schema);
    }

    let mut document = json!({
        "openapi": "3.1.0",
        "info": {
            "title": "xboct-log",
            "version": env!("CARGO_PKG_VERSION"),
        },
        "paths": Value::Object(paths),
        "components": {
            "schemas": Value::Object(schemas),
        },
    });
    move_defs(&mut document);
    document
}

fn error_response(description: &str) -> Value {
    json!({
        "description": description,
        "content": {
            "application/json": {
                "schema": {"$ref": "#/components/schemas/Error"},
            }
        },
    })
}

fn first_line(description: &str) -> &str {
    description
        .split(". ")
        .next()
        .unwrap_or(description)
        .trim_end_matches('.')
}

fn prepare(mut value: Value, defs: &mut Map<String, Value>) -> Value {
    drop_null_defaults(&mut value);
    let Value::Object(object) = &mut value else {
        return value;
    };
    object.remove("$schema");
    let Some(Value::Object(local)) = object.remove("$defs") else {
        return value;
    };
    let mut names = std::collections::HashMap::new();
    for (name, schema) in &local {
        let target = match defs.get(name) {
            None => name.clone(),
            Some(existing) if existing == schema => name.clone(),
            Some(_) => {
                let mut index = 2;
                loop {
                    let candidate = format!("{name}{index}");
                    match defs.get(&candidate) {
                        None => break candidate,
                        Some(existing) if existing == schema => break candidate,
                        Some(_) => index += 1,
                    }
                }
            }
        };
        names.insert(name.clone(), target);
    }
    for (name, mut schema) in local {
        rename_refs(&mut schema, &names);
        defs.insert(names[&name].clone(), schema);
    }
    for nested in object.values_mut() {
        rename_refs(nested, &names);
    }
    value
}

fn drop_null_defaults(value: &mut Value) {
    match value {
        Value::Object(object) => {
            if object.get("default").is_some_and(Value::is_null) {
                object.remove("default");
            }
            for nested in object.values_mut() {
                drop_null_defaults(nested);
            }
        }
        Value::Array(items) => {
            for item in items {
                drop_null_defaults(item);
            }
        }
        _ => {}
    }
}

fn rename_refs(value: &mut Value, names: &std::collections::HashMap<String, String>) {
    match value {
        Value::Object(object) => {
            if let Some(Value::String(reference)) = object.get_mut("$ref")
                && let Some(name) = reference.strip_prefix("#/$defs/")
                && let Some(target) = names.get(name)
            {
                *reference = format!("#/$defs/{target}");
            }
            for nested in object.values_mut() {
                rename_refs(nested, names);
            }
        }
        Value::Array(items) => {
            for item in items {
                rename_refs(item, names);
            }
        }
        _ => {}
    }
}

fn move_defs(value: &mut Value) {
    match value {
        Value::Object(object) => {
            if let Some(Value::String(reference)) = object.get_mut("$ref")
                && let Some(name) = reference.strip_prefix("#/$defs/")
            {
                *reference = format!("#/components/schemas/{name}");
            }
            for nested in object.values_mut() {
                move_defs(nested);
            }
        }
        Value::Array(items) => {
            for item in items {
                move_defs(item);
            }
        }
        _ => {}
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn describes_every_operation_on_its_own_path() {
        let document = document();
        let paths = document["paths"].as_object().unwrap();
        assert_eq!(paths.len(), metadata().len());
        for info in metadata() {
            let path = &paths[&format!("/api/{}", info.name)];
            let post = &path["post"];
            assert_eq!(post["operationId"], info.name);
            let input = &post["requestBody"]["content"]["application/json"]["schema"];
            assert!(input["$schema"].is_null(), "{} keeps $schema", info.name);
            let output = &post["responses"]["200"]["content"]["application/json"]["schema"];
            assert!(!output.is_null(), "{} has no output schema", info.name);
        }
        assert_eq!(document["components"]["schemas"]["Error"]["type"], "object");
    }

    #[test]
    fn publishes_the_operation_names_in_the_activity_filter() {
        let document = document();
        assert_eq!(
            document["paths"]["/api/activity_list"]["post"]["requestBody"]["content"]["application/json"]
                ["schema"]["properties"]["op"]["anyOf"][0]["$ref"],
            json!("#/components/schemas/OpName")
        );
        let names: Vec<&str> = xboct_log_core::OpName::ALL
            .iter()
            .map(|name| name.as_str())
            .collect();
        assert_eq!(
            document["components"]["schemas"]["OpName"]["enum"],
            json!(names)
        );
    }
}
