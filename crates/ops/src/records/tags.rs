use schemars::JsonSchema;

use serde::{Deserialize, Serialize};
use xboct_log_core::{
    Entity, OneOrList, OpName, ProjectId, Result, Status, TagCount, TagInventoryEntry, TagName,
    TagQuery, TagRecord, ensure_tag, list_dictionary, list_tag_inventory, list_tags, rename_tag,
    set_tag_archived,
};

use crate::{Ctx, EmptyInput, Kind, Op};

#[derive(Debug, Default, Deserialize, JsonSchema)]
#[serde(default, deny_unknown_fields)]
pub struct ListInput {
    #[schemars(
        description = "Count only the tags of these projects. Accepts one id or a list of ids."
    )]
    pub project_id: Option<OneOrList<ProjectId>>,
    #[schemars(
        description = "Count only the tags of tasks in these statuses. Accepts one status or a list of statuses."
    )]
    pub status: Option<OneOrList<Status>>,
}

#[derive(Debug, Serialize, JsonSchema)]
pub struct TagListOutput {
    pub items: Vec<TagCount>,
    pub total: usize,
}

pub struct TagsList;

impl Op for TagsList {
    const NAME: OpName = OpName::TagsList;
    const KIND: Kind = Kind::Query;
    const MCP: bool = true;
    const LAZY: bool = true;

    type Input = ListInput;
    type Output = TagListOutput;

    fn description() -> &'static str {
        crate::descriptions::TAGS_LIST
    }

    async fn run(ctx: &Ctx, input: Self::Input) -> Result<Self::Output> {
        let query = TagQuery {
            project_ids: input
                .project_id
                .map(OneOrList::into_vec)
                .unwrap_or_default(),
            statuses: input.status.map(OneOrList::into_vec).unwrap_or_default(),
        };
        let items = list_tags(&ctx.db, &query).await?;
        Ok(TagListOutput {
            total: items.len(),
            items,
        })
    }
}

#[derive(Debug, Serialize, JsonSchema)]
pub struct DictionaryOutput {
    pub items: Vec<TagName>,
}

pub struct TagsDictionary;

impl Op for TagsDictionary {
    const NAME: OpName = OpName::TagsDictionary;
    const KIND: Kind = Kind::Query;
    const MCP: bool = true;
    const LAZY: bool = true;

    type Input = EmptyInput;
    type Output = DictionaryOutput;

    fn description() -> &'static str {
        crate::descriptions::TAGS_DICTIONARY
    }

    async fn run(ctx: &Ctx, _input: Self::Input) -> Result<Self::Output> {
        let items = list_dictionary(&ctx.db)
            .await?
            .into_iter()
            .filter(|tag| !tag.archived)
            .map(|tag| tag.name)
            .collect();
        Ok(DictionaryOutput { items })
    }
}

#[derive(Debug, Serialize, JsonSchema)]
pub struct InventoryOutput {
    pub items: Vec<TagInventoryEntry>,
    pub total: usize,
}

pub struct TagsInventory;

impl Op for TagsInventory {
    const NAME: OpName = OpName::TagsInventory;
    const KIND: Kind = Kind::Query;
    const MCP: bool = false;
    const LAZY: bool = true;

    type Input = EmptyInput;
    type Output = InventoryOutput;

    fn description() -> &'static str {
        crate::descriptions::TAGS_INVENTORY
    }

    async fn run(ctx: &Ctx, _input: Self::Input) -> Result<Self::Output> {
        let items = list_tag_inventory(&ctx.db).await?;
        Ok(InventoryOutput {
            total: items.len(),
            items,
        })
    }
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct CreateInput {
    pub name: String,
}

pub struct TagsCreate;

impl Op for TagsCreate {
    const NAME: OpName = OpName::TagsCreate;
    const KIND: Kind = Kind::Command;
    const MCP: bool = true;
    const LAZY: bool = true;

    type Input = CreateInput;
    type Output = TagRecord;

    fn description() -> &'static str {
        crate::descriptions::TAGS_CREATE
    }

    fn entity() -> Option<Entity> {
        Some(Entity::Tags)
    }

    async fn run(ctx: &Ctx, input: Self::Input) -> Result<Self::Output> {
        ensure_tag(&ctx.db, &input.name).await
    }
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct PatchInput {
    pub archived: bool,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct UpdateInput {
    pub name: String,
    pub patch: PatchInput,
}

pub struct TagsUpdate;

impl Op for TagsUpdate {
    const NAME: OpName = OpName::TagsUpdate;
    const KIND: Kind = Kind::Command;
    const MCP: bool = true;
    const LAZY: bool = true;

    type Input = UpdateInput;
    type Output = TagRecord;

    fn description() -> &'static str {
        crate::descriptions::TAGS_UPDATE
    }

    fn entity() -> Option<Entity> {
        Some(Entity::Tags)
    }

    async fn run(ctx: &Ctx, input: Self::Input) -> Result<Self::Output> {
        set_tag_archived(&ctx.db, &input.name, input.patch.archived).await
    }
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct RenameInput {
    pub name: String,
    pub new_name: String,
}

pub struct TagsRename;

impl Op for TagsRename {
    const NAME: OpName = OpName::TagsRename;
    const KIND: Kind = Kind::Command;
    const MCP: bool = true;
    const LAZY: bool = true;

    type Input = RenameInput;
    type Output = TagRecord;

    fn description() -> &'static str {
        crate::descriptions::TAGS_RENAME
    }

    fn entity() -> Option<Entity> {
        Some(Entity::Tags)
    }

    async fn run(ctx: &Ctx, input: Self::Input) -> Result<Self::Output> {
        rename_tag(&ctx.db, &input.name, &input.new_name).await
    }
}
