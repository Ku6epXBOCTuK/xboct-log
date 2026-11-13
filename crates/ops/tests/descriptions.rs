use std::{collections::HashMap, fs, path::PathBuf};

use serde_json::Value;
use xboct_log_ops::metadata;

#[test]
fn keeps_the_node_descriptions_of_the_registered_operations() {
    let path =
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../tests/parity/fixtures/contract.json");
    let text = fs::read_to_string(&path).expect("tests/parity/fixtures/contract.json");
    let contract: Value = serde_json::from_str(&text).expect("the contract is json");

    let ops = contract["ops"]
        .as_array()
        .expect("the contract lists the operations");
    let mut expected: HashMap<&str, &str> = ops
        .iter()
        .filter_map(|op| {
            Some((
                op["name"].as_str()?,
                op["description"].as_str().unwrap_or_default(),
            ))
        })
        .collect();

    let tools = contract["mcp"]["tools"]["tools"]
        .as_array()
        .expect("the contract lists the mcp tools");
    for tool in tools {
        if let Some(name) = tool["name"].as_str() {
            expected.insert(name, tool["description"].as_str().unwrap_or_default());
        }
    }

    for op in metadata() {
        let node = expected
            .get(op.name)
            .unwrap_or_else(|| panic!("{} is not in the node contract", op.name));
        assert_eq!(op.description, *node, "{} description", op.name);
    }
}
