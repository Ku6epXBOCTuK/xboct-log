use super::*;

#[test]
fn keeps_the_last_segment_of_a_path() {
    assert_eq!(safe_name("C:/logs/today log.txt"), "today log.txt");
    assert_eq!(safe_name("a/b/../../etc/passwd"), "passwd");
    assert_eq!(safe_name("   "), "file");
    assert_eq!(safe_name("отчёт.txt"), "_____.txt");
}

#[test]
fn decodes_base64_leniently_like_node() {
    assert_eq!(decode_base64("cGFyaXR5"), Some(b"parity".to_vec()));
    assert_eq!(decode_base64("cGFyaXR5="), Some(b"parity".to_vec()));
    assert_eq!(decode_base64("cGFyaXR5=="), Some(b"parity".to_vec()));
    assert_eq!(decode_base64("cGFyaXR5==="), None);
    assert_eq!(decode_base64(""), None);
}
