use std::{borrow::Borrow, fmt};

use serde::{Deserialize, Serialize};

use crate::AppError;

macro_rules! text_newtype {
    ($name:ident) => {
        #[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
        #[serde(transparent)]
        pub struct $name(String);

        impl $name {
            pub fn new(value: impl Into<String>) -> Self {
                Self(value.into())
            }

            pub fn as_str(&self) -> &str {
                &self.0
            }

            pub fn into_string(self) -> String {
                self.0
            }
        }

        impl fmt::Display for $name {
            fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
                formatter.write_str(&self.0)
            }
        }

        impl AsRef<str> for $name {
            fn as_ref(&self) -> &str {
                &self.0
            }
        }

        impl Borrow<str> for $name {
            fn borrow(&self) -> &str {
                &self.0
            }
        }

        impl PartialEq<&str> for $name {
            fn eq(&self, other: &&str) -> bool {
                self.0 == *other
            }
        }

        impl PartialEq<$name> for &str {
            fn eq(&self, other: &$name) -> bool {
                *self == other.0
            }
        }

        impl From<String> for $name {
            fn from(value: String) -> Self {
                Self(value)
            }
        }

        impl From<&str> for $name {
            fn from(value: &str) -> Self {
                Self(value.to_owned())
            }
        }

        impl From<$name> for String {
            fn from(value: $name) -> Self {
                value.0
            }
        }
    };
}

text_newtype!(ProjectId);
text_newtype!(TagName);
text_newtype!(TaskKey);
text_newtype!(Prefix);

impl TaskKey {
    pub fn parse(value: &str) -> Result<Self, AppError> {
        let trimmed = value.trim();
        let Some((prefix, number)) = trimmed.rsplit_once('-') else {
            return Err(bare_key());
        };
        if prefix.is_empty()
            || number.is_empty()
            || !number.bytes().all(|byte| byte.is_ascii_digit())
        {
            return Err(bare_key());
        }
        if !prefix.bytes().all(|byte| byte.is_ascii_alphanumeric()) {
            return Err(bare_key());
        }
        Ok(Self(format!("{}-{}", prefix.to_ascii_uppercase(), number)))
    }
}

fn bare_key() -> AppError {
    AppError::validation(
        "Use the full 'PREFIX-NUMBER' id (e.g. 'LOG-82'): a bare number is unique only inside a project.",
    )
}

impl Prefix {
    pub fn parse(value: &str) -> Result<Self, AppError> {
        let trimmed = value.trim();
        if trimmed.is_empty()
            || trimmed.len() > 6
            || !trimmed.bytes().all(|byte| byte.is_ascii_alphanumeric())
        {
            return Err(AppError::validation(
                "prefix must be 1-6 uppercase letters or digits",
            ));
        }
        Ok(Self(trimmed.to_ascii_uppercase()))
    }
}

impl TagName {
    pub fn normalized(value: &str) -> Self {
        Self(value.trim().to_lowercase())
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(transparent)]
pub struct ScopeId(i64);

impl ScopeId {
    pub fn new(value: i64) -> Self {
        Self(value)
    }

    pub fn get(self) -> i64 {
        self.0
    }
}

impl From<i64> for ScopeId {
    fn from(value: i64) -> Self {
        Self(value)
    }
}

impl From<ScopeId> for i64 {
    fn from(value: ScopeId) -> Self {
        value.0
    }
}

impl std::fmt::Display for ScopeId {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(formatter, "{}", self.0)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(transparent)]
pub struct Seq(i64);

impl Seq {
    pub fn new(value: i64) -> Self {
        Self(value)
    }

    pub fn get(self) -> i64 {
        self.0
    }
}

impl From<i64> for Seq {
    fn from(value: i64) -> Self {
        Self(value)
    }
}

impl From<Seq> for i64 {
    fn from(value: Seq) -> Self {
        value.0
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_task_keys() {
        assert_eq!(TaskKey::parse("log-82").unwrap().as_str(), "LOG-82");
        assert!(TaskKey::parse("82").is_err());
        assert!(TaskKey::parse("LOG-").is_err());
        assert!(TaskKey::parse("LOG-x").is_err());
    }

    #[test]
    fn normalizes_tags_and_prefixes() {
        assert_eq!(TagName::normalized("  Bug ").as_str(), "bug");
        assert_eq!(Prefix::parse("ab1").unwrap().as_str(), "AB1");
        assert!(Prefix::parse("toolong").is_err());
    }

    #[test]
    fn keeps_json_transparent() {
        let key: TaskKey = serde_json::from_value(serde_json::json!("LOG-1")).unwrap();
        assert_eq!(
            serde_json::to_value(&key).unwrap(),
            serde_json::json!("LOG-1")
        );
        let scope: ScopeId = serde_json::from_value(serde_json::json!(7)).unwrap();
        assert_eq!(scope.get(), 7);
    }
}
