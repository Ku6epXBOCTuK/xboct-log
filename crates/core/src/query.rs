use schemars::JsonSchema;
use serde::Deserialize;
use sqlx::{QueryBuilder, Sqlite};

#[derive(Debug, Clone, Deserialize, JsonSchema)]
#[serde(untagged)]
pub enum OneOrList<T> {
    One(T),
    Many(Vec<T>),
}

impl<T> OneOrList<T> {
    pub fn into_vec(self) -> Vec<T> {
        match self {
            Self::One(value) => vec![value],
            Self::Many(values) => values,
        }
    }
}

#[derive(Debug, Clone, Deserialize, JsonSchema)]
#[serde(untagged)]
pub enum FieldSelection {
    Csv(String),
    List(Vec<String>),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum Order {
    Asc,
    Desc,
}

pub(crate) fn like_pattern(term: &str) -> String {
    format!("%{}%", term.to_lowercase())
}

pub(crate) fn push_in_text<T: AsRef<str>>(
    qb: &mut QueryBuilder<Sqlite>,
    column: &str,
    values: &[T],
) {
    qb.push(column).push(" IN (");
    let mut separated = qb.separated(", ");
    for value in values {
        separated.push_bind(value.as_ref().to_string());
    }
    separated.push_unseparated(")");
}

#[cfg(test)]
mod tests {
    use super::{like_pattern, push_in_text};
    use sqlx::{QueryBuilder, Sqlite};

    #[test]
    fn wraps_lowercased_term_in_percent_signs() {
        assert_eq!(like_pattern("Ab"), "%ab%");
        assert_eq!(like_pattern(""), "%%");
        assert_eq!(like_pattern("ПРИВЕТ"), "%привет%");
        assert_eq!(like_pattern("ΟΣ"), "%ος%");
    }

    #[test]
    fn builds_an_in_clause_from_text_values() {
        let mut qb = QueryBuilder::<Sqlite>::new("SELECT 1 WHERE ");
        push_in_text(&mut qb, "key", &["a".to_string(), "b".to_string()]);
        assert_eq!(qb.sql(), "SELECT 1 WHERE key IN (?, ?)");

        let mut qb = QueryBuilder::<Sqlite>::new("SELECT 1 WHERE ");
        push_in_text(&mut qb, "key", &[] as &[String]);
        assert_eq!(qb.sql(), "SELECT 1 WHERE key IN ()");
    }
}
