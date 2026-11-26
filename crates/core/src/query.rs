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

pub(crate) fn push_like(qb: &mut QueryBuilder<Sqlite>, lhs: &str, term: &str) {
    qb.push(lhs)
        .push(" LIKE ")
        .push_bind(like_pattern(term))
        .push(" ESCAPE '\\'");
}

fn like_pattern(term: &str) -> String {
    let escaped = term
        .to_lowercase()
        .replace('\\', "\\\\")
        .replace('%', "\\%")
        .replace('_', "\\_");
    format!("%{escaped}%")
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
    use super::{like_pattern, push_in_text, push_like};
    use sqlx::{QueryBuilder, Sqlite};

    #[test]
    fn wraps_lowercased_term_in_percent_signs() {
        assert_eq!(like_pattern("Ab"), "%ab%");
        assert_eq!(like_pattern(""), "%%");
        assert_eq!(like_pattern("ПРИВЕТ"), "%привет%");
        assert_eq!(like_pattern("ΟΣ"), "%ος%");
    }

    #[test]
    fn escapes_like_metacharacters_in_the_term() {
        assert_eq!(like_pattern("100%"), "%100\\%%");
        assert_eq!(like_pattern("a_b"), "%a\\_b%");
        assert_eq!(like_pattern("a\\b"), "%a\\\\b%");
        assert_eq!(like_pattern("100%_\\"), "%100\\%\\_\\\\%");
    }

    #[test]
    fn pushes_like_with_an_escape_clause() {
        let mut qb = QueryBuilder::<Sqlite>::new("SELECT 1 WHERE ");
        push_like(&mut qb, "ULOWER(title)", "a_b");
        assert_eq!(qb.sql(), "SELECT 1 WHERE ULOWER(title) LIKE ? ESCAPE '\\'");
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
