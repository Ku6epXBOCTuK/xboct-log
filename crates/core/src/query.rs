use schemars::JsonSchema;
use serde::Deserialize;

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

#[cfg(test)]
mod tests {
    use super::like_pattern;

    #[test]
    fn wraps_lowercased_term_in_percent_signs() {
        assert_eq!(like_pattern("Ab"), "%ab%");
        assert_eq!(like_pattern(""), "%%");
        assert_eq!(like_pattern("ПРИВЕТ"), "%привет%");
        assert_eq!(like_pattern("ΟΣ"), "%ος%");
    }
}
