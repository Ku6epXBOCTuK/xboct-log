use super::*;

impl Backlog {
    pub(super) async fn call_named(
        &self,
        name: &str,
        arguments: Value,
        client: Option<String>,
    ) -> (String, Value, CallToolResult) {
        if name == "xboct_log_call" {
            let input: CallInput = match serde_json::from_value(arguments.clone()) {
                Ok(input) => input,
                Err(error) => {
                    let message = format!("Input validation error for xboct_log_call: {error}");
                    return (name.to_string(), arguments, bare_failure(&message));
                }
            };
            if input.tool == "xboct_log_call" || input.tool == "xboct_log_tool_description" {
                let message =
                    "xboct_log_call cannot call xboct_log_tool_description or xboct_log_call";
                return (name.to_string(), arguments, bare_failure(message));
            }
            return self.call_direct(&input.tool, input.args, client).await;
        }
        if name == "xboct_log_tool_description" {
            let result = match serde_json::from_value::<ToolDescriptionInput>(arguments.clone()) {
                Ok(input) => self.call_tool_description(&input.query).await,
                Err(error) => {
                    let message =
                        format!("Input validation error for xboct_log_tool_description: {error}");
                    bare_failure(&message)
                }
            };
            return (name.to_string(), arguments, result);
        }
        self.call_direct(name, arguments, client).await
    }

    pub(super) async fn call_direct(
        &self,
        name: &str,
        arguments: Value,
        client: Option<String>,
    ) -> (String, Value, CallToolResult) {
        let problem = validation_error(name, &arguments);
        let arguments = normalize_arguments(name, arguments);
        let result = if let Some(message) = problem {
            bare_failure(&message)
        } else if name == "attachments_read" {
            self.call_attachments_read(&arguments).await
        } else {
            let ctx = self.context(client);
            match dispatch(&ctx, name, arguments.clone()).await {
                Ok(value) => success(value),
                Err(error) => failure(&error),
            }
        };
        (name.to_string(), arguments, result)
    }

    pub(super) async fn call_tool_description(&self, query: &str) -> CallToolResult {
        let needle = query.trim().to_lowercase();
        let hint = mcp_text::active_tags_hint(&self.db)
            .await
            .unwrap_or_default();
        let catalog = tool_catalog();
        if let Some(entry) = catalog
            .iter()
            .find(|info| info.name == needle)
            .and_then(|info| catalog_entry(info, &hint))
        {
            return success(json!(ToolDescriptionOutput { items: vec![entry] }));
        }
        let words: Vec<&str> = needle.split_whitespace().collect();
        let mut found: Vec<(usize, CatalogEntry)> = catalog
            .into_iter()
            .filter_map(|info| {
                let name = info.name.to_lowercase();
                let description = info.description.to_lowercase();
                let mut score = 0;
                if !needle.is_empty() {
                    if name.contains(&needle) {
                        score += 6;
                    }
                    if description.contains(&needle) {
                        score += 3;
                    }
                    for word in &words {
                        if name.contains(word) {
                            score += 2;
                        }
                        if description.contains(word) {
                            score += 1;
                        }
                    }
                    if score == 0 {
                        return None;
                    }
                }
                catalog_entry(&info, &hint).map(|entry| (score, entry))
            })
            .collect();
        found.sort_by(|left, right| {
            right
                .0
                .cmp(&left.0)
                .then_with(|| left.1.name.cmp(&right.1.name))
        });
        found.truncate(MAX_DESCRIPTION_RESULTS);
        let items = found.into_iter().map(|(_, entry)| entry).collect();
        success(json!(ToolDescriptionOutput { items }))
    }

    pub(super) async fn call_attachments_read(&self, arguments: &Value) -> CallToolResult {
        let id = match arguments.get("attachment_id").and_then(Value::as_str) {
            Some(id) => id,
            None => {
                return failure(&AppError::validation(
                    "attachment_id: expected a string with the attachment id",
                ));
            }
        };
        let (attachment, contents) = match self.read_attachment(id).await {
            Ok(found) => found,
            Err(error) => return failure(&error),
        };
        let mime = attachment_mime(&attachment.file_name);
        let bytes = contents.data;
        let body = if mime.starts_with("image/") {
            ContentBlock::Image(ImageContent::new(STANDARD.encode(&bytes), mime))
        } else if mime.starts_with("text/") || mime == "application/json" {
            ContentBlock::text(String::from_utf8_lossy(&bytes).into_owned())
        } else {
            ContentBlock::text(format!("data:{mime};base64,{}", STANDARD.encode(&bytes)))
        };
        let item = json!({ "item": attachment });
        let mut result = CallToolResult::success(vec![
            body,
            ContentBlock::text(serde_json::to_string(&item).unwrap_or_default()),
        ]);
        result.structured_content = Some(item);
        settle_success(&mut result);
        result
    }
}
