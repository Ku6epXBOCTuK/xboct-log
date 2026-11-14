use serde_json::{Map, Value, json};
use xboct_log_ops::{metadata, operation_schema};

pub fn document() -> Value {
    let mut paths = Map::new();
    for info in metadata() {
        let Some((input, output)) = operation_schema(info.name) else {
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
                        "content": {"application/json": {"schema": schema(input)}},
                    },
                    "responses": {
                        "200": {
                            "description": "The result of the operation",
                            "content": {"application/json": {"schema": schema(output)}},
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

    json!({
        "openapi": "3.1.0",
        "info": {
            "title": "xboct-log",
            "version": env!("CARGO_PKG_VERSION"),
        },
        "paths": Value::Object(paths),
        "components": {
            "schemas": {
                "Error": {
                    "type": "object",
                    "properties": {
                        "kind": {"type": "string"},
                        "message": {"type": "string"},
                    },
                    "required": ["kind", "message"],
                }
            }
        },
    })
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

fn schema(text: &str) -> Value {
    let mut value: Value = serde_json::from_str(text).unwrap_or_else(|error| {
        panic!("the generated operation schema is not json: {error}");
    });
    if let Value::Object(object) = &mut value {
        object.remove("$schema");
    }
    value
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
            assert!(output.is_object(), "{} has no output schema", info.name);
        }
        assert_eq!(document["components"]["schemas"]["Error"]["type"], "object");
    }
}
