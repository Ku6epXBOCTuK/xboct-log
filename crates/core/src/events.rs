use schemars::JsonSchema;

use std::sync::atomic::{AtomicU64, Ordering};

use serde::{Deserialize, Serialize};
use tokio::sync::broadcast;

const CHANNEL_CAPACITY: usize = 1024;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Entity {
    Tasks,
    Plans,
    Documents,
    Projects,
    Scopes,
    Tags,
    Comments,
}

impl Entity {
    pub fn as_str(self) -> &'static str {
        match self {
            Entity::Tasks => "tasks",
            Entity::Plans => "plans",
            Entity::Documents => "documents",
            Entity::Projects => "projects",
            Entity::Scopes => "scopes",
            Entity::Tags => "tags",
            Entity::Comments => "comments",
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum ActivitySource {
    Ui,
    Mcp,
    Cli,
}

impl ActivitySource {
    pub fn as_str(self) -> &'static str {
        match self {
            ActivitySource::Ui => "ui",
            ActivitySource::Mcp => "mcp",
            ActivitySource::Cli => "cli",
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct ChangeEvent {
    pub seq: u64,
    pub entity: Entity,
    pub op: String,
    pub source: ActivitySource,
    pub client: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ServerEvent {
    Change(ChangeEvent),
    Reset,
}

#[derive(Debug)]
pub struct Events {
    seq: AtomicU64,
    sender: broadcast::Sender<ServerEvent>,
}

impl Events {
    pub fn new() -> Self {
        Self::with_capacity(CHANNEL_CAPACITY)
    }

    pub fn with_capacity(capacity: usize) -> Self {
        let (sender, _) = broadcast::channel(capacity);
        Self {
            seq: AtomicU64::new(0),
            sender,
        }
    }

    pub fn current_seq(&self) -> u64 {
        self.seq.load(Ordering::SeqCst)
    }

    pub fn subscribe(&self) -> broadcast::Receiver<ServerEvent> {
        self.sender.subscribe()
    }

    pub fn subscriber_count(&self) -> usize {
        self.sender.receiver_count()
    }

    pub fn publish_change(
        &self,
        entity: Entity,
        op: impl Into<String>,
        source: ActivitySource,
        client: Option<String>,
    ) -> u64 {
        let seq = self.seq.fetch_add(1, Ordering::SeqCst) + 1;
        let event = ServerEvent::Change(ChangeEvent {
            seq,
            entity,
            op: op.into(),
            source,
            client,
        });
        let _ = self.sender.send(event);
        seq
    }

    pub fn publish_reset(&self) {
        let _ = self.sender.send(ServerEvent::Reset);
    }
}

impl Default for Events {
    fn default() -> Self {
        Self::new()
    }
}

pub fn entity_of(op_name: &str) -> Option<Entity> {
    if op_name.starts_with("tasks_comments_") {
        return Some(Entity::Comments);
    }
    match op_name.split('_').next()? {
        "tasks" | "attachments" => Some(Entity::Tasks),
        "plans" => Some(Entity::Plans),
        "documents" => Some(Entity::Documents),
        "projects" => Some(Entity::Projects),
        "scopes" => Some(Entity::Scopes),
        "tags" => Some(Entity::Tags),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_operations_to_entities_like_the_node_registry() {
        assert_eq!(entity_of("tasks_close"), Some(Entity::Tasks));
        assert_eq!(entity_of("plans_create"), Some(Entity::Plans));
        assert_eq!(entity_of("documents_create"), Some(Entity::Documents));
        assert_eq!(entity_of("tasks_comments_add"), Some(Entity::Comments));
        assert_eq!(entity_of("attachments_add"), Some(Entity::Tasks));
        assert_eq!(entity_of("projects_create"), Some(Entity::Projects));
        assert_eq!(entity_of("scopes_delete"), Some(Entity::Scopes));
        assert_eq!(entity_of("tags_inventory"), Some(Entity::Tags));
        assert_eq!(entity_of("backup_create"), None);
        assert_eq!(entity_of("activity_list"), None);
    }

    #[test]
    fn numbers_changes_and_resets_the_same_way() {
        let events = Events::new();
        assert_eq!(events.current_seq(), 0);
        let mut receiver = events.subscribe();
        assert_eq!(events.subscriber_count(), 1);

        let seq = events.publish_change(Entity::Tasks, "tasks_create", ActivitySource::Ui, None);
        assert_eq!(seq, 1);
        assert_eq!(events.current_seq(), 1);
        assert_eq!(
            receiver.try_recv(),
            Ok(ServerEvent::Change(ChangeEvent {
                seq: 1,
                entity: Entity::Tasks,
                op: "tasks_create".into(),
                source: ActivitySource::Ui,
                client: None,
            }))
        );

        events.publish_reset();
        assert_eq!(receiver.try_recv(), Ok(ServerEvent::Reset));

        drop(receiver);
        assert_eq!(events.subscriber_count(), 0);
        assert_eq!(
            events.publish_change(
                Entity::Projects,
                "projects_update",
                ActivitySource::Mcp,
                Some("claude".into())
            ),
            2
        );
    }

    #[test]
    fn serializes_the_event_fields_in_the_node_order() {
        let event = ChangeEvent {
            seq: 7,
            entity: Entity::Comments,
            op: "tasks_comments_add".into(),
            source: ActivitySource::Cli,
            client: None,
        };
        assert_eq!(
            serde_json::to_string(&event).unwrap(),
            r#"{"seq":7,"entity":"comments","op":"tasks_comments_add","source":"cli","client":null}"#
        );
    }
}
