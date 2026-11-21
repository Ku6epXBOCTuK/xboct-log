pub const INSTRUCTIONS_BASE: &str = "Task backlog server for a single user. The instructions below list every tool name with its purpose and the exact arguments of the everyday tools; they are always in context. In Code Mode call a tool inside execute as tools[\"XBOCT-log\"].<name>({...}). If the name is missing from the catalog shown to you, run search({query: '<name>'}) first, then call it. Do not call xboct_log_tool_description for an everyday tool: its arguments are already listed here. Use xboct_log_tool_description {query: 'tool_name'} only for a rare tool, then call it with xboct_log_call {tool, args}. tasks_*, projects_*, scopes_* and tags_list tools list, create, update and delete tasks, projects and scopes. tags_list returns the tag dictionary. tasks_revisions_list reads the previous description and comment texts of a task. tasks_deleted_list returns the soft-deleted tasks, the ones that tasks_restore can bring back. attachments_list, attachments_add, attachments_delete and attachments_verify work with the files of a task: they are kept in the media folder, and attachments_verify reports the files that are gone from it. attachments_read returns the file itself, an image as an image block. Every attachment is also a resource: read xboct-log://attachment/{id} with resources/read to get its bytes, take the uri from attachments_list. The resource xboct-log://attachments lists them all. Descriptions and comments are Markdown and formatting is rendered: format them, and put a short log, config or command output in a fenced code block. Keep source code in the repository and describe the algorithm instead, and stay short - no walls of text. A raw log or dump that is really needed belongs in an attachment, not pasted into the text. backup_create makes a manual database backup, backup_list shows the existing snapshots. Restoring a backup is not part of these tools: the user restores a snapshot on the Backups page of the UI, tell them which one. Check isError before reading the payload: a failed call explains the cause in the text, and errors raised by the tool itself also carry structuredContent.error = { kind, message }. Create tasks in batches with tasks_create_many: it answers with one result per item instead of one call per task. Pass a top-level items array with a per-item project_id and title (for example {\"items\":[{\"project_id\":\"brul\",\"title\":\"...\"}]}); a top-level project_id is not accepted. All tools accept a single JSON object argument. Working markdown is moved into plans and documents once per project; AGENTS.md, README.md, CHANGELOG.md, fixtures and generated files stay in the repository. source_file is provenance only, never an import key. Reading a large backlog: tasks_list pages itself - follow next_offset until it is gone, each page is about 24 KB and arrives whole, so one call never returns 300 tasks. Start with fields [\"id\",\"title\",\"status\",\"priority\",\"tags\",\"updated_at\"] and limit 1000 for an index, then tasks_get the interesting ones. Add description_chars (1..=2000) to skim descriptions from the whole text; include_description on a large list overflows and is not a bulk-read mode. The transfer boundary is documented in docs/working-documents.md. Task tools address a task by task_id in the full 'PREFIX-NUMBER' form (e.g. 'LOG-42'); attachments address a file by attachment_id, the `id` field of an item from attachments_list. Plans are global and have no project_id: read one plan's ordered items with tasks_list {plan_id, sort: 'plan_position', include_deleted: true}, its notes with plans_notes_list and its document links with plans_documents_list. Documents are project-owned and addressed by their internal id or 'PREFIX-DOC-NNN' key (e.g. 'BRUL-DOC-1'); task ids are not document ids; documents_list and plans_documents_list return short_body by default, set include_body to read the full text, and accept project_id/kind/status/q/title/title_exact/source_file filters, sort/order, fields, include_deleted/deleted_only, limit/offset and total. Set include_plan_names on tasks_list to get readable plan references; tasks_get always returns plan_names. Every document is also a resource: read xboct-log://document/{key or id} with resources/read to get its Markdown text; the index xboct-log://documents lists documents. Every task returned by create, update, close, move, link and batch operations carries the same plan_names together with the unchanged plan_ids UUID list. plans_list and documents_list accept include_deleted and deleted_only, so the separate *_deleted_list ops are not needed to find soft-deleted entities.";

pub fn build_instructions(tools: &[(String, String)], everyday: &[(String, String)]) -> String {
    let mut text = String::from(INSTRUCTIONS_BASE);
    text.push_str("\n\nAll tool names and their purpose:\n");
    for (name, summary) in tools {
        text.push_str(&format!("- {name}: {summary}\n"));
    }
    text.push_str("\nEveryday tool arguments:\n");
    for (name, arguments) in everyday {
        text.push_str(&format!("- {name}({arguments})\n"));
    }
    text
}

pub const TOOL_DESCRIPTION_DESCRIPTION: &str = "Get the full description and argument schema of a tool by exact name, for example {query: 'tasks_restore'}. An exact name returns only that tool; words from a name or description return up to 8 matches. Everyday tools already carry their arguments in the server instructions and do not need this call. Call a rare tool with xboct_log_call {tool, args}. An empty query lists the catalog in alphabetical order.";

pub const XBOCT_LOG_CALL_DESCRIPTION: &str = "Run a rare tool by name with its arguments: {tool, args}. Use xboct_log_tool_description first to learn the exact name and parameters. Everyday tools do not need this: call them directly with tools[\"XBOCT-log\"].<name>({...}) in Code Mode. The target tool goes through the same validation and returns the same result as a direct call; errors carry structuredContent.error. xboct_log_tool_description and xboct_log_call cannot be called through this tool.";

pub const ATTACHMENTS_READ_DESCRIPTION: &str = "Read the file of one attachment, not only its metadata. An image comes back as an image block, text as text, anything else as base64 in a data URL. Use it to look at a screenshot attached to a task instead of searching the disk for the file. An attachment is at most 20 MB and a big one costs a lot of context, so check size in attachments_list first. A file too big to read can be downloaded from /media/{id} of this server instead.";

pub const RESOURCES_DESCRIPTION: &str = "Every attachment of the backlog with the uri that holds its bytes. Read it when attachments may have been added or removed since the client connected.";

pub const RESOURCES_TITLE: &str = "Task attachments";

pub const TEMPLATE_TITLE: &str = "Task attachment";

pub const TEMPLATE_DESCRIPTION: &str = "The file of one task attachment, base64-encoded. Take the uri from attachments_list. An attachment is at most 20 MB.";

pub const ATTACHMENT_TITLE: &str = "Task attachment";

pub const DOCUMENTS_RESOURCES_DESCRIPTION: &str = "Every document with the uri that holds its Markdown text. Read it when documents may have been added or removed since the client connected.";

pub const DOCUMENTS_RESOURCES_TITLE: &str = "Documents";

pub const DOCUMENT_TEMPLATE_TITLE: &str = "Document";

pub const DOCUMENT_TEMPLATE_DESCRIPTION: &str = "The Markdown text of one document. The key is a 'PREFIX-DOC-NNN' id (e.g. 'BRUL-DOC-1'); the internal id also works.";
