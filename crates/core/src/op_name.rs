macro_rules! op_names {
    ($($variant:ident => $name:literal),+ $(,)?) => {
        #[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize)]
        #[serde(rename_all = "snake_case")]
        pub enum OpName {
            $($variant),+
        }

        impl OpName {
            pub const ALL: &'static [OpName] = &[$(OpName::$variant),+];

            pub const fn as_str(self) -> &'static str {
                match self {
                    $(OpName::$variant => $name),+
                }
            }
        }

        impl std::fmt::Display for OpName {
            fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                formatter.write_str(self.as_str())
            }
        }
    };
}

op_names![
    TasksHistory => "tasks_history",
    ActivityList => "activity_list",
    AttachmentsList => "attachments_list",
    AttachmentsDeletedList => "attachments_deleted_list",
    AttachmentsAdd => "attachments_add",
    AttachmentsDelete => "attachments_delete",
    AttachmentsRestore => "attachments_restore",
    AttachmentsMove => "attachments_move",
    AttachmentsCopy => "attachments_copy",
    AttachmentsPurge => "attachments_purge",
    AttachmentsVerify => "attachments_verify",
    BackupCreate => "backup_create",
    BackupList => "backup_list",
    BackupsInspect => "backups_inspect",
    BackupsRestore => "backups_restore",
    TasksAddBlocker => "tasks_add_blocker",
    TasksRemoveBlocker => "tasks_remove_blocker",
    TasksAddLink => "tasks_add_link",
    TasksRemoveLink => "tasks_remove_link",
    TasksCommentsList => "tasks_comments_list",
    TasksCommentsAdd => "tasks_comments_add",
    TasksCommentsEdit => "tasks_comments_edit",
    TasksCommentsDelete => "tasks_comments_delete",
    TasksOptions => "tasks_options",
    ProjectsList => "projects_list",
    ProjectsGet => "projects_get",
    ProjectsCreate => "projects_create",
    ProjectsUpdate => "projects_update",
    TasksRevisionsList => "tasks_revisions_list",
    ScopesList => "scopes_list",
    ScopesGet => "scopes_get",
    ScopesProjectIds => "scopes_project_ids",
    ScopesCreate => "scopes_create",
    ScopesUpdate => "scopes_update",
    ScopesDelete => "scopes_delete",
    TasksStats => "tasks_stats",
    TasksList => "tasks_list",
    TasksDeletedList => "tasks_deleted_list",
    TasksGetMany => "tasks_get_many",
    TasksGet => "tasks_get",
    TasksCreate => "tasks_create",
    TasksCreateMany => "tasks_create_many",
    TasksUpdate => "tasks_update",
    TasksUpdateMany => "tasks_update_many",
    TasksClose => "tasks_close",
    TasksCloseMany => "tasks_close_many",
    TasksDelete => "tasks_delete",
    TasksRestore => "tasks_restore",
    TasksMove => "tasks_move",
    TagsList => "tags_list",
    TagsDictionary => "tags_dictionary",
    TagsInventory => "tags_inventory",
    TagsCreate => "tags_create",
    TagsUpdate => "tags_update",
    TagsRename => "tags_rename",
];

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names_round_trip_through_serde() {
        for name in OpName::ALL {
            let text = serde_json::to_value(name).unwrap();
            assert_eq!(text.as_str(), Some(name.as_str()));
            let parsed: OpName = serde_json::from_value(text).unwrap();
            assert_eq!(parsed, *name);
            assert_eq!(name.to_string(), name.as_str());
        }
    }

    #[test]
    fn rejects_a_name_that_is_not_an_operation() {
        let error = serde_json::from_value::<OpName>(serde_json::json!("tasks_missing"))
            .unwrap_err()
            .to_string();
        assert!(error.contains("unknown variant"), "{error}");
        assert!(serde_json::from_value::<OpName>(serde_json::json!("")).is_err());
    }
}
