use std::{
    collections::BTreeSet,
    fs,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use xboct_log_ops::metadata;
use xboct_log_parity::{
    plan,
    snapshot::read_database,
    sweep::{Calls, Sweep},
};

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

    let fixture = PathBuf::from(
        argument(&args, "--fixtures").unwrap_or_else(|| "tests/parity/fixtures".to_owned()),
    );
    let calls_path = fixture.join("ops.json");
    let text = fs::read_to_string(&calls_path)
        .map_err(|error| format!("cannot read {}: {error}", calls_path.display()))?;
    let calls: Calls = serde_json::from_str(&text)
        .map_err(|error| format!("{} is not json: {error}", calls_path.display()))?;

    let replay_database = out.join("sweep.sqlite");
    copy_database(&database, &replay_database)?;
    let sweep = Sweep {
        runtime,
        database: replay_database,
        now_ms: fixture_now(&calls_path),
    };
    let (replayed, mismatches) = sweep.run(&calls).await.map_err(|error| error.to_string())?;
    write_json(&out.join("ops.json"), &replayed)?;
    println!(
        "replayed {} of {} calls, {} mismatch(es)",
        replayed.calls.len(),
        calls.calls.len(),
        mismatches.len()
    );
    for line in mismatches.iter().take(20) {
        println!("  {line}");
    }
    if !mismatches.is_empty() {
        return Err(format!(
            "{} replayed call(s) differ from the node snapshots",
            mismatches.len()
        ));
    }

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

fn fixture_now(path: &Path) -> i64 {
    fs::metadata(path)
        .and_then(|metadata| metadata.modified())
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or_else(now_ms)
}

fn copy_database(source: &Path, target: &Path) -> Result<(), String> {
    for suffix in ["", "-wal", "-shm"] {
        let from = PathBuf::from(format!("{}{suffix}", source.display()));
        let to = PathBuf::from(format!("{}{suffix}", target.display()));
        if to.exists() {
            fs::remove_file(&to)
                .map_err(|error| format!("cannot remove {}: {error}", to.display()))?;
        }
        if from.exists() {
            fs::copy(&from, &to)
                .map_err(|error| format!("cannot copy {}: {error}", from.display()))?;
        }
    }
    Ok(())
}
