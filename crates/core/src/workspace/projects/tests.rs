use super::*;

#[test]
fn normalizes_repositories_like_node() {
    assert_eq!(
        normalize_repo("https://GitHub.com/xboct/spa.git").as_deref(),
        Some("github.com/xboct/spa")
    );
    assert_eq!(
        normalize_repo("git@github.com:xboct/spa.git").as_deref(),
        Some("github.com/xboct/spa")
    );
    assert_eq!(
        normalize_repo("ssh://git@github.com/xboct/spa/").as_deref(),
        Some("github.com/xboct/spa")
    );
    assert_eq!(normalize_repo("  "), None);
    assert_eq!(normalize_repo("github.com"), None);
    assert_eq!(normalize_repo("github.com/owner/../name"), None);
}

#[test]
fn rejects_repositories_like_node() {
    assert_eq!(repo_error(""), None);
    assert_eq!(repo_error("github.com/xboct/spa"), None);
    assert_eq!(
        repo_error("github.com/xboct"),
        Some("Repository must look like host/owner/name".to_string())
    );
    assert_eq!(
        repo_error("github.com/xboct/sp a"),
        Some("Repository must look like host/owner/name".to_string())
    );
    assert_eq!(
        repo_error(&format!("github.com/{}/spa", "a".repeat(REPO_MAX_LENGTH))),
        Some("Repository must be 200 characters or fewer".to_string())
    );
}

#[test]
fn validates_project_ids_and_prefixes() {
    assert_eq!(project_id_error("spa"), None);
    assert_eq!(
        project_id_error(""),
        Some("Project id is required".to_string())
    );
    assert_eq!(
        project_id_error("SPA"),
        Some("Project id may contain latin letters, digits and dashes".to_string())
    );
    assert_eq!(project_prefix_error("SPA"), None);
    assert_eq!(normalize_prefix(" spa ").as_str(), "SPA");
    assert_eq!(
        project_prefix_error("SPA-1"),
        Some("Project prefix must be 1-6 uppercase letters or digits".to_string())
    );
}

#[test]
fn reserves_the_plan_prefix() {
    assert_eq!(
        project_prefix_error("PL"),
        Some("Project prefix PL is reserved for plans".to_string())
    );
    assert!(project_prefix_error("pl").is_some());
    assert_eq!(project_prefix_error("PLX"), None);
}
