use sqlx::{
    Executor, FromRow, Sqlite,
    query::Query,
    sqlite::{SqliteArguments, SqliteRow},
};

use crate::error::{AppError, Result};

pub fn unexpected(message: impl Into<String>) -> sqlx::Error {
    sqlx::Error::Decode(Box::new(AppError::unexpected(message)))
}

pub async fn fetch_one_row<'q, 'e, T, E>(
    query: Query<'q, Sqlite, SqliteArguments>,
    executor: E,
) -> Result<Option<T>>
where
    T: for<'r> FromRow<'r, SqliteRow>,
    E: Executor<'e, Database = Sqlite>,
    'q: 'e,
{
    Ok(query
        .fetch_optional(executor)
        .await?
        .map(|row| T::from_row(&row))
        .transpose()?)
}

pub async fn fetch_by_id<'q, 'e, T, E>(
    query: Query<'q, Sqlite, SqliteArguments>,
    executor: E,
) -> Result<Option<T>>
where
    T: for<'r> FromRow<'r, SqliteRow>,
    E: Executor<'e, Database = Sqlite>,
    'q: 'e,
{
    fetch_one_row(query, executor).await
}
