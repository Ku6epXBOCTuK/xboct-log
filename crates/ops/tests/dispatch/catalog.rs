use super::*;

#[test]
fn lists_the_registered_operations() {
    let ops = metadata();
    let names: Vec<&str> = ops.iter().map(|op| op.name).collect();
    assert_eq!(
        names,
        vec![
            "tasks_history",
            "activity_list",
            "request_log_list",
            "request_log_export",
            "attachments_list",
            "attachments_deleted_list",
            "attachments_add",
            "attachments_delete",
            "attachments_restore",
            "attachments_move",
            "attachments_copy",
            "attachments_purge",
            "attachments_verify",
            "backup_create",
            "backup_list",
            "backups_inspect",
            "backups_restore",
            "tasks_add_blocker",
            "tasks_remove_blocker",
            "tasks_add_link",
            "tasks_remove_link",
            "tasks_comments_list",
            "tasks_comments_add",
            "tasks_comments_edit",
            "tasks_comments_delete",
            "tasks_options",
            "projects_list",
            "projects_get",
            "projects_create",
            "projects_update",
            "tasks_revisions_list",
            "scopes_list",
            "scopes_get",
            "scopes_project_ids",
            "scopes_create",
            "scopes_update",
            "scopes_delete",
            "tasks_stats",
            "tasks_list",
            "tasks_deleted_list",
            "tasks_get_many",
            "tasks_get",
            "tasks_create",
            "tasks_create_many",
            "tasks_update",
            "tasks_update_many",
            "tasks_close",
            "tasks_close_many",
            "tasks_delete",
            "tasks_restore",
            "tasks_move",
            "tags_list",
            "tags_dictionary",
            "tags_inventory",
            "tags_create",
            "tags_update",
            "tags_rename",
            "plans_list",
            "plans_get",
            "plans_create",
            "plans_update",
            "plans_delete",
            "plans_restore",
            "plans_deleted_list",
            "plans_items_add",
            "plans_items_remove",
            "plans_reorder",
            "plans_notes_list",
            "plans_notes_add",
            "plans_notes_edit",
            "plans_notes_delete",
            "plans_notes_restore",
            "plans_notes_deleted_list",
            "plans_notes_revisions_list",
            "documents_list",
            "documents_get",
            "documents_create",
            "documents_update",
            "documents_delete",
            "documents_restore",
            "documents_deleted_list",
            "documents_revisions_list",
            "plans_documents_list",
            "plans_documents_link",
            "plans_documents_unlink",
        ]
    );

    let commands = [
        "attachments_add",
        "attachments_delete",
        "attachments_restore",
        "attachments_move",
        "attachments_copy",
        "attachments_purge",
        "backup_create",
        "backups_inspect",
        "backups_restore",
        "tasks_add_blocker",
        "tasks_remove_blocker",
        "tasks_add_link",
        "tasks_remove_link",
        "tasks_comments_add",
        "tasks_comments_edit",
        "tasks_comments_delete",
        "projects_create",
        "projects_update",
        "scopes_create",
        "scopes_update",
        "scopes_delete",
        "tasks_create",
        "tasks_create_many",
        "tasks_update",
        "tasks_update_many",
        "tasks_close",
        "tasks_close_many",
        "tasks_delete",
        "tasks_restore",
        "tasks_move",
        "tags_create",
        "tags_update",
        "tags_rename",
        "plans_create",
        "plans_update",
        "plans_delete",
        "plans_restore",
        "plans_items_add",
        "plans_items_remove",
        "plans_reorder",
        "plans_notes_add",
        "plans_notes_edit",
        "plans_notes_delete",
        "plans_notes_restore",
        "documents_create",
        "documents_update",
        "documents_delete",
        "documents_restore",
        "plans_documents_link",
        "plans_documents_unlink",
    ];
    let common = [
        "tasks_list",
        "tasks_get",
        "tasks_create",
        "tasks_update",
        "tasks_close",
        "documents_list",
        "documents_get",
        "plans_documents_list",
        "plans_list",
        "plans_get",
        "plans_create",
        "plans_update",
        "plans_items_add",
        "plans_items_remove",
        "plans_reorder",
        "plans_notes_list",
        "plans_notes_add",
        "plans_notes_edit",
    ];
    for op in &ops {
        let hidden = ["tags_inventory", "backups_inspect", "backups_restore"];
        assert_eq!(op.mcp, !hidden.contains(&op.name), "{} mcp", op.name);
        assert_eq!(op.lazy, !common.contains(&op.name), "{} lazy", op.name);
        assert!(!op.description.is_empty(), "{} has a description", op.name);
        let kind = if commands.contains(&op.name) {
            Kind::Command
        } else {
            Kind::Query
        };
        assert_eq!(op.kind, kind, "{} kind", op.name);
    }

    let find = |name: &str| {
        ops.iter()
            .find(|op| op.name == name)
            .unwrap_or_else(|| panic!("{name} is registered"))
    };
    assert_eq!(find("tasks_list").kind, Kind::Query);
    assert_eq!(find("tasks_comments_list").kind, Kind::Query);
    assert_eq!(find("tasks_comments_add").kind, Kind::Command);
    assert_eq!(find("tasks_options").kind, Kind::Query);
    assert_eq!(find("projects_create").kind, Kind::Command);
    assert_eq!(find("scopes_delete").kind, Kind::Command);
    assert!(!find("tags_inventory").mcp);
    assert!(
        find("tasks_history")
            .description
            .starts_with("Show the change log")
    );
    assert!(
        find("projects_list")
            .description
            .starts_with("List projects")
    );
    assert!(
        find("projects_create")
            .description
            .starts_with("Create a project")
    );
    assert!(find("scopes_list").description.starts_with("List scopes"));
    assert_eq!(find("projects_list").entity, None);
    assert_eq!(find("projects_create").entity, Some(Entity::Projects));
    assert_eq!(find("scopes_create").entity, Some(Entity::Scopes));
    assert_eq!(find("tasks_comments_add").entity, Some(Entity::Comments));

    let all: Vec<&str> = OpName::ALL.iter().map(|name| name.as_str()).collect();
    assert_eq!(all, names);
}
