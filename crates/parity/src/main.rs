use std::{
    collections::BTreeSet,
    fs,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use xboct_log_ops::metadata;
use xboct_log_parity::{plan, snapshot::read_database};

fn argument(args: &[String], flag: &str) -> Option<String> {
    let index = args.iter().position(|value| value == flag)?;
    args.get(index + 1).cloned()
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or_default()
}

#[tokio::main]
async fn main() {
    if let Err(error) = run().await {
        eprintln!("{error}");
        std::process::exit(1);
    }
}

async fn run() -> Result<(), String> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let out = PathBuf::from(
        argument(&args, "--out").unwrap_or_else(|| "tests/parity/.tmp/rust".to_owned()),
    );
    let runtime = PathBuf::from(
        argument(&args, "--runtime").unwrap_or_else(|| "tests/parity/.tmp/runtime".to_owned()),
    );
    let database = runtime.join("db.sqlite");

    if !database.exists() {
        return Err(format!(
            "{} is missing; run pnpm parity:seed to build the node database",
            database.display()
        ));
    }

    fs::create_dir_all(&out).map_err(|error| error.to_string())?;

    let document = read_database(&database, now_ms()).await?;
    write_json(&out.join("db.json"), &document)?;
    println!(
        "wrote {} from {}",
        out.join("db.json").display(),
        database.display()
    );

    let registry: BTreeSet<&str> = metadata().iter().map(|op| op.name).collect();
    let planned = plan::planned();
    let missing: Vec<&str> = planned
        .iter()
        .copied()
        .filter(|name| !registry.contains(name))
        .collect();
    let unused: Vec<&str> = registry
        .iter()
        .copied()
        .filter(|name| !planned.contains(name))
        .collect();

    println!(
        "operations: {} in the registry, {} in the plan, {} missing, {} not planned",
        registry.len(),
        planned.len(),
        missing.len(),
        unused.len()
    );
    if !missing.is_empty() {
        println!("missing from the registry, in call order:");
        for name in &missing {
            println!("  {name}");
        }
    }
    if !unused.is_empty() {
        println!("planned nowhere:");
        for name in &unused {
            println!("  {name}");
        }
    }
    if !missing.is_empty() || !unused.is_empty() {
        return Err("the operation plan and the registry do not match yet".to_owned());
    }

    Ok(())
}

fn write_json(path: &Path, value: &impl serde::Serialize) -> Result<(), String> {
    let mut text = serde_json::to_string_pretty(value).map_err(|error| error.to_string())?;
    text.push('\n');
    fs::write(path, text).map_err(|error| format!("cannot write {}: {error}", path.display()))
}
