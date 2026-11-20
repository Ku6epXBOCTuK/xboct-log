use crate::{AppError, Result};

pub const DEFAULT_LIMIT: i64 = 50;
pub const MAX_LIMIT: i64 = 200;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Limit(i64);

impl Limit {
    pub fn get(self) -> i64 {
        self.0
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Offset(i64);

impl Offset {
    pub fn get(self) -> i64 {
        self.0
    }
}

pub fn validate_limit(value: Option<i64>, default: i64, max: i64) -> Result<Limit> {
    let value = value.unwrap_or(default);
    if !(1..=max).contains(&value) {
        return Err(AppError::validation(format!(
            "limit must be between 1 and {max}"
        )));
    }
    Ok(Limit(value))
}

pub fn validate_offset(value: Option<i64>) -> Result<Offset> {
    let value = value.unwrap_or(0);
    if value < 0 {
        return Err(AppError::validation("offset must be zero or positive"));
    }
    Ok(Offset(value))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn applies_the_default_when_absent() {
        assert_eq!(validate_limit(None, 50, 200).unwrap().get(), 50);
        assert_eq!(validate_offset(None).unwrap().get(), 0);
    }

    #[test]
    fn accepts_the_boundaries() {
        assert_eq!(validate_limit(Some(1), 50, 200).unwrap().get(), 1);
        assert_eq!(validate_limit(Some(200), 50, 200).unwrap().get(), 200);
        assert_eq!(validate_offset(Some(0)).unwrap().get(), 0);
    }

    #[test]
    fn rejects_out_of_range_limits() {
        for value in [0, -1, 201] {
            let error = validate_limit(Some(value), 50, 200).unwrap_err();
            assert_eq!(error.message(), "limit must be between 1 and 200");
        }
    }

    #[test]
    fn rejects_negative_offsets() {
        let error = validate_offset(Some(-1)).unwrap_err();
        assert_eq!(error.message(), "offset must be zero or positive");
    }
}
