use std::{collections::BTreeMap, path::Path};

use serde::Serialize;
use serde_json::{Map, Value};
use sqlx::{
    Connection, Row, SqliteConnection,
    sqlite::{SqliteConnectOptions, SqliteRow},
};

use crate::normalize::{Normalizer, identities_of};

const SKIPPED_TABLES: [&str; 1] = ["_sqlx_migrations"];

#[derive(Serialize)]
pub struct MasterRow {
    #[serde(rename = "type")]
    pub kind: String,
    pub name: String,
    pub tbl_name: String,
    pub sql: Option<String>,
}

#[derive(Serialize)]
pub struct ColumnInfo {
    pub name: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub notnull: i64,
    pub dflt_value: Option<String>,
    pub pk: i64,
}

#[derive(Serialize)]
pub struct Sequence {
    pub name: String,
    pub seq: i64,
}

#[derive(Serialize)]
pub struct DatabaseDocument {
    pub schema: Vec<MasterRow>,
    pub columns: BTreeMap<String, Vec<ColumnInfo>>,
    pub sequences: Vec<Sequence>,
    pub rows: BTreeMap<String, Vec<Value>>,
}

fn quote(name: &str) -> String {
    format!("\"{}\"", name.replace('"', "\"\""))
}

pub async fn read_database(path: &Path, now_ms: i64) -> Result<DatabaseDocument, String> {
    let options = SqliteConnectOptions::new().filename(path).read_only(true);
    let mut connection = SqliteConnection::connect_with(&options)
        .await
        .map_err(|error| format!("cannot open {}: {error}", path.display()))?;

    let document = read_snapshot(&mut connection, now_ms).await;
    let _ = connection.close().await;
    document
}

pub async fn read_identity_rows(
    path: &Path,
) -> Result<BTreeMap<String, Vec<serde_json::Map<String, Value>>>, String> {
    let options = SqliteConnectOptions::new().filename(path).read_only(true);
    let mut connection = SqliteConnection::connect_with(&options)
        .await
        .map_err(|error| error.to_string())?;

    let mut raw_rows = BTreeMap::new();
    for table in ["tasks", "task_attachments", "task_comments"] {
        let sql: Option<String> =
            sqlx::query_scalar("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?")
                .bind(table)
                .fetch_optional(&mut connection)
                .await
                .map_err(|error| error.to_string())?;
        let table_columns = read_columns(&mut connection, table).await?;
        let rows = read_rows(&mut connection, table, &table_columns, sql.as_deref()).await?;
        raw_rows.insert(table.to_owned(), rows);
    }
    Ok(raw_rows)
}

async fn read_snapshot(
    connection: &mut SqliteConnection,
    now_ms: i64,
) -> Result<DatabaseDocument, String> {
    let schema_rows = sqlx::query(
        "SELECT type, name, tbl_name, sql FROM sqlite_master
         WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name",
    )
    .fetch_all(&mut *connection)
    .await
    .map_err(|error| error.to_string())?;

    let schema: Vec<MasterRow> = schema_rows
        .iter()
        .map(|row| MasterRow {
            kind: row.get("type"),
            name: row.get("name"),
            tbl_name: row.get("tbl_name"),
            sql: row.get("sql"),
        })
        .collect();

    let tables: Vec<(String, Option<String>)> = schema
        .iter()
        .filter(|row| row.kind == "table" && !SKIPPED_TABLES.contains(&row.name.as_str()))
        .map(|row| (row.name.clone(), row.sql.clone()))
        .collect();

    let mut columns = BTreeMap::new();
    let mut raw_rows = BTreeMap::new();
    for (table, sql) in &tables {
        let table_columns = read_columns(connection, table).await?;
        let rows = read_rows(connection, table, &table_columns, sql.as_deref()).await?;
        columns.insert(table.clone(), table_columns);
        raw_rows.insert(table.clone(), rows);
    }

    let identities = identities_of(&raw_rows);
    let mut normalizer = Normalizer::new(now_ms, None, identities);

    let mut rows = BTreeMap::new();
    for (table, table_rows) in raw_rows {
        let mut normalized: Vec<Value> = table_rows
            .iter()
            .map(|row| normalizer.normalize(&Value::Object(row.clone())))
            .collect();
        if table == "task_links" {
            canonicalize_links(&mut normalized);
        }
        if tables
            .iter()
            .any(|(name, sql)| name == &table && is_without_rowid_sql(sql.as_deref()))
        {
            normalized.sort_by_key(sortable);
        }
        rows.insert(table, normalized);
    }

    let sequences = read_sequences(connection, &schema).await?;

    Ok(DatabaseDocument {
        schema,
        columns,
        sequences,
        rows,
    })
}

async fn read_columns(
    connection: &mut SqliteConnection,
    table: &str,
) -> Result<Vec<ColumnInfo>, String> {
    let rows = sqlx::query(sqlx::AssertSqlSafe(format!(
        "PRAGMA table_info({})",
        quote(table)
    )))
    .fetch_all(&mut *connection)
    .await
    .map_err(|error| error.to_string())?;
    Ok(rows
        .iter()
        .map(|row| ColumnInfo {
            name: row.get("name"),
            kind: row.get("type"),
            notnull: row.get("notnull"),
            dflt_value: row.get("dflt_value"),
            pk: row.get("pk"),
        })
        .collect())
}

async fn read_rows(
    connection: &mut SqliteConnection,
    table: &str,
    columns: &[ColumnInfo],
    sql: Option<&str>,
) -> Result<Vec<Map<String, Value>>, String> {
    let values = columns
        .iter()
        .map(|column| quote(&column.name))
        .collect::<Vec<_>>()
        .join(", ");
    let types = columns
        .iter()
        .enumerate()
        .map(|(index, column)| {
            format!(
                "typeof({}) AS {}",
                quote(&column.name),
                quote(&format!("__type_{index}"))
            )
        })
        .collect::<Vec<_>>()
        .join(", ");
    let order = if is_without_rowid_sql(sql) {
        let mut primary: Vec<(i64, String)> = columns
            .iter()
            .filter(|column| column.pk > 0)
            .map(|column| (column.pk, quote(&column.name)))
            .collect();
        primary.sort_by_key(|(position, _)| *position);
        primary
            .into_iter()
            .map(|(_, name)| name)
            .collect::<Vec<_>>()
            .join(", ")
    } else {
        "rowid".to_owned()
    };

    let rows = sqlx::query(sqlx::AssertSqlSafe(format!(
        "SELECT {values}, {types} FROM {} ORDER BY {order}",
        quote(table)
    )))
    .fetch_all(&mut *connection)
    .await
    .map_err(|error| format!("cannot read {table}: {error}"))?;

    let mut read = Vec::with_capacity(rows.len());
    for row in &rows {
        read.push(read_row(row, columns)?);
    }
    Ok(read)
}

fn read_row(row: &SqliteRow, columns: &[ColumnInfo]) -> Result<Map<String, Value>, String> {
    let mut values = Map::new();
    for (index, column) in columns.iter().enumerate() {
        let storage: String = row.get(index + columns.len());
        let value = match storage.as_str() {
            "null" => Value::Null,
            "integer" => {
                Value::from(row.try_get::<i64, _>(index).map_err(|error| {
                    format!("column {} is not an integer: {error}", column.name)
                })?)
            }
            "real" => Value::from(
                row.try_get::<f64, _>(index)
                    .map_err(|error| format!("column {} is not a real: {error}", column.name))?,
            ),
            "text" => Value::from(
                row.try_get::<String, _>(index)
                    .map_err(|error| format!("column {} is not text: {error}", column.name))?,
            ),
            other => return Err(format!("column {} has storage class {other}", column.name)),
        };
        values.insert(column.name.clone(), value);
    }
    Ok(values)
}

async fn read_sequences(
    connection: &mut SqliteConnection,
    schema: &[MasterRow],
) -> Result<Vec<Sequence>, String> {
    if !schema.iter().any(|row| row.name == "sqlite_sequence") {
        return Ok(Vec::new());
    }
    let rows = sqlx::query("SELECT name, seq FROM sqlite_sequence ORDER BY name")
        .fetch_all(&mut *connection)
        .await
        .map_err(|error| error.to_string())?;
    Ok(rows
        .iter()
        .map(|row| Sequence {
            name: row.get("name"),
            seq: row.get("seq"),
        })
        .collect())
}

fn is_without_rowid_sql(sql: Option<&str>) -> bool {
    sql.unwrap_or_default()
        .to_uppercase()
        .split_whitespace()
        .collect::<Vec<_>>()
        .windows(2)
        .any(|pair| pair == ["WITHOUT", "ROWID"])
}

fn canonicalize_links(rows: &mut [Value]) {
    for row in rows {
        let Some(object) = row.as_object_mut() else {
            continue;
        };
        if object.get("link_type").and_then(Value::as_str) != Some("relates_to") {
            continue;
        }
        let source = object
            .get("source_task_id")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_owned();
        let target = object
            .get("target_task_id")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_owned();
        if source > target {
            object.insert("source_task_id".to_owned(), Value::from(target));
            object.insert("target_task_id".to_owned(), Value::from(source));
        }
    }
}

fn sortable(row: &Value) -> String {
    serde_json::to_string(row)
        .unwrap_or_default()
        .to_lowercase()
}
