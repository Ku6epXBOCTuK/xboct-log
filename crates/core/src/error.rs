use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum AppError {
    #[error("{0}")]
    Validation(String),
    #[error("{0}")]
    NotFound(String),
    #[error("{0}")]
    Conflict(String),
    #[error("{0}")]
    Unexpected(String),
}

impl AppError {
    pub fn kind(&self) -> AppErrorKind {
        match self {
            Self::Validation(_) => AppErrorKind::Validation,
            Self::NotFound(_) => AppErrorKind::NotFound,
            Self::Conflict(_) => AppErrorKind::Conflict,
            Self::Unexpected(_) => AppErrorKind::Unexpected,
        }
    }

    pub fn status(&self) -> ErrorStatus {
        match self.kind() {
            AppErrorKind::Validation => ErrorStatus::BadRequest,
            AppErrorKind::NotFound => ErrorStatus::NotFound,
            AppErrorKind::Conflict => ErrorStatus::Conflict,
            AppErrorKind::Unexpected => ErrorStatus::Internal,
        }
    }

    pub fn message(&self) -> &str {
        match self {
            Self::Validation(message)
            | Self::NotFound(message)
            | Self::Conflict(message)
            | Self::Unexpected(message) => message,
        }
    }

    pub fn validation(message: impl Into<String>) -> Self {
        Self::Validation(message.into())
    }

    pub fn not_found(message: impl Into<String>) -> Self {
        Self::NotFound(message.into())
    }

    pub fn conflict(message: impl Into<String>) -> Self {
        Self::Conflict(message.into())
    }

    pub fn unexpected(message: impl Into<String>) -> Self {
        Self::Unexpected(message.into())
    }
}

impl From<sqlx::Error> for AppError {
    fn from(error: sqlx::Error) -> Self {
        Self::Unexpected(error.to_string())
    }
}

impl From<std::io::Error> for AppError {
    fn from(error: std::io::Error) -> Self {
        Self::Unexpected(error.to_string())
    }
}

impl From<serde_json::Error> for AppError {
    fn from(error: serde_json::Error) -> Self {
        Self::Unexpected(error.to_string())
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AppErrorKind {
    Validation,
    NotFound,
    Conflict,
    Unexpected,
}

impl AppErrorKind {
    pub const ALL: [Self; 4] = [
        Self::Validation,
        Self::NotFound,
        Self::Conflict,
        Self::Unexpected,
    ];
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ErrorStatus {
    BadRequest,
    NotFound,
    Conflict,
    Internal,
}

impl ErrorStatus {
    pub fn as_u16(self) -> u16 {
        match self {
            Self::BadRequest => 400,
            Self::NotFound => 404,
            Self::Conflict => 409,
            Self::Internal => 500,
        }
    }
}

pub type Result<T, E = AppError> = std::result::Result<T, E>;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_the_error_kinds() {
        assert_eq!(AppError::validation("x").status().as_u16(), 400);
        assert_eq!(AppError::not_found("x").status().as_u16(), 404);
        assert_eq!(AppError::conflict("x").status().as_u16(), 409);
        assert_eq!(AppError::unexpected("x").status().as_u16(), 500);
        assert_eq!(AppError::unexpected("x").kind(), AppErrorKind::Unexpected);
        assert_eq!(AppError::validation("x").message(), "x");
    }

    #[test]
    fn wraps_a_sqlx_error_as_unexpected() {
        let error = AppError::from(sqlx::Error::RowNotFound);
        assert_eq!(error.kind(), AppErrorKind::Unexpected);
    }
}
