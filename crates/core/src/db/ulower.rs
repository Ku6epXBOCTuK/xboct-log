use std::{
    ffi::{c_char, c_int},
    ptr, slice,
};

use icu_casemap::CaseMapper;
use icu_locale_core::langid;
use libsqlite3_sys::{
    SQLITE_BLOB, SQLITE_DETERMINISTIC, SQLITE_FLOAT, SQLITE_INTEGER, SQLITE_NULL, SQLITE_TRANSIENT,
    SQLITE_UTF8, sqlite3_context, sqlite3_create_function_v2, sqlite3_result_null,
    sqlite3_result_text64, sqlite3_value, sqlite3_value_blob, sqlite3_value_bytes,
    sqlite3_value_double, sqlite3_value_int64, sqlite3_value_text, sqlite3_value_type,
};
use sqlx::SqliteConnection;

pub(crate) async fn register(conn: &mut SqliteConnection) -> Result<(), sqlx::Error> {
    let mut handle = conn.lock_handle().await?;
    let db = handle.as_raw_handle().as_ptr();

    let result = unsafe {
        sqlite3_create_function_v2(
            db,
            c"ULOWER".as_ptr(),
            1,
            SQLITE_UTF8 | SQLITE_DETERMINISTIC,
            ptr::null_mut(),
            Some(lower),
            None,
            None,
            None,
        )
    };

    if result != 0 {
        return Err(sqlx::Error::Protocol(format!(
            "registering ULOWER failed with code {result}"
        )));
    }

    Ok(())
}

unsafe extern "C" fn lower(
    context: *mut sqlite3_context,
    argc: c_int,
    argv: *mut *mut sqlite3_value,
) {
    if argc != 1 || argv.is_null() {
        unsafe { sqlite3_result_null(context) };
        return;
    }

    let value = unsafe { *argv };
    if value.is_null() {
        unsafe { sqlite3_result_null(context) };
        return;
    }

    let text = match unsafe { sqlite3_value_type(value) } {
        SQLITE_NULL => {
            unsafe { sqlite3_result_null(context) };
            return;
        }
        SQLITE_INTEGER => unsafe { sqlite3_value_int64(value) }.to_string(),
        SQLITE_FLOAT => unsafe { sqlite3_value_double(value) }.to_string(),
        SQLITE_BLOB => blob_text(value),
        _ => text_value(value),
    };

    let lowered = CaseMapper::new()
        .lowercase_to_string(&text, &langid!("und"))
        .into_owned();
    let bytes = lowered.as_bytes();

    unsafe {
        sqlite3_result_text64(
            context,
            bytes.as_ptr().cast::<c_char>(),
            bytes.len() as u64,
            SQLITE_TRANSIENT(),
            SQLITE_UTF8 as u8,
        );
    }
}

fn text_value(value: *mut libsqlite3_sys::sqlite3_value) -> String {
    let pointer = unsafe { sqlite3_value_text(value) };
    if pointer.is_null() {
        return String::new();
    }
    let length = unsafe { sqlite3_value_bytes(value) }.max(0) as usize;
    let bytes = unsafe { slice::from_raw_parts(pointer, length) };
    String::from_utf8_lossy(bytes).into_owned()
}

fn blob_text(value: *mut libsqlite3_sys::sqlite3_value) -> String {
    let pointer = unsafe { sqlite3_value_blob(value) };
    if pointer.is_null() {
        return String::new();
    }
    let length = unsafe { sqlite3_value_bytes(value) }.max(0) as usize;
    let bytes = unsafe { slice::from_raw_parts(pointer.cast::<u8>(), length) };
    let parts: Vec<String> = bytes.iter().map(u8::to_string).collect();
    parts.join(",")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lowercases_text_with_the_unicode_rules() {
        let lower = |text: &str| {
            CaseMapper::new()
                .lowercase_to_string(text, &langid!("und"))
                .into_owned()
        };

        assert_eq!(lower("Привет"), "привет");
        assert_eq!(lower("İstanbul"), "i\u{307}stanbul");
        assert_eq!(lower("ΟΣ"), "ος");
        assert_eq!(lower("Σ"), "σ");
        assert_eq!(lower("ABC"), "abc");
        assert_eq!(lower(""), "");
    }
}
