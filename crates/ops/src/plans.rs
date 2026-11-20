use schemars::JsonSchema;
use serde::Deserialize;
use serde_json::Value;
use xboct_log_core::{
    AppError, Entity, OpName, Plan, PlanItem, PlanNote, PlanPatch, PlanStatus, PlanWithCounts,
    Result, TextRevision, add_plan_item, add_plan_note, create_plan, delete_plan, delete_plan_note,
    edit_plan_note, list_deleted_plan_notes, list_deleted_plans, list_plan_note_revisions,
    list_plan_notes, list_plans, plan_counts, remove_plan_item, reorder_plan_items, require_plan,
    restore_plan, restore_plan_note, update_plan,
};

use crate::{Ctx, EmptyInput, Items, Kind, Op};

#[derive(Debug, Default, Deserialize, JsonSchema)]
#[serde(default, deny_unknown_fields)]
pub struct PlansListInput {
    #[schemars(
        description = "Include soft-deleted plans alongside active ones. By default they are hidden."
    )]
    pub include_deleted: Option<bool>,
    #[schemars(description = "Return only soft-deleted plans. Overrides include_deleted.")]
    pub deleted_only: Option<bool>,
}

pub struct PlansList;

impl Op for PlansList {
    const NAME: OpName = OpName::PlansList;
    const KIND: Kind = Kind::Query;
    const MCP: bool = true;

    type Input = PlansListInput;
    type Output = Items<PlanWithCounts>;

    fn description() -> &'static str {
        crate::descriptions::PLANS_LIST
    }

    async fn run(ctx: &Ctx, input: Self::Input) -> Result<Self::Output> {
        let mut plans = if input.deleted_only == Some(true) {
            list_deleted_plans(&ctx.db).await?
        } else {
            let mut plans = list_plans(&ctx.db).await?;
            if input.include_deleted == Some(true) {
                plans.extend(list_deleted_plans(&ctx.db).await?);
            }
            plans
        };
        plans.sort_by(|a, b| a.name.cmp(&b.name).then_with(|| a.id.cmp(&b.id)));
        let counts = xboct_log_core::count_plan_items(&ctx.db).await?;
        Ok(Items {
            items: plans
                .into_iter()
                .map(|plan| {
                    let count = counts.get(&plan.id).copied().unwrap_or_default();
                    PlanWithCounts::new(plan, count)
                })
                .collect(),
        })
    }
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct PlanIdInput {
    #[schemars(description = "Plan id: short key 'PL-1' (case-insensitive) or the full UUID.")]
    pub plan_id: String,
}

pub struct PlansGet;

impl Op for PlansGet {
    const NAME: OpName = OpName::PlansGet;
    const KIND: Kind = Kind::Query;
    const MCP: bool = true;

    type Input = PlanIdInput;
    type Output = PlanWithCounts;

    fn description() -> &'static str {
        crate::descriptions::PLANS_GET
    }

    async fn run(ctx: &Ctx, input: Self::Input) -> Result<Self::Output> {
        let plan = require_plan(&ctx.db, &input.plan_id).await?;
        let counts = plan_counts(&ctx.db, &plan.id).await?;
        Ok(PlanWithCounts::new(plan, counts))
    }
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct CreateInput {
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub status: Option<PlanStatus>,
}

pub struct PlansCreate;

impl Op for PlansCreate {
    const NAME: OpName = OpName::PlansCreate;
    const KIND: Kind = Kind::Command;
    const MCP: bool = true;

    type Input = CreateInput;
    type Output = Plan;

    fn description() -> &'static str {
        crate::descriptions::PLANS_CREATE
    }

    fn entity() -> Option<Entity> {
        Some(Entity::Plans)
    }

    async fn run(ctx: &Ctx, input: Self::Input) -> Result<Self::Output> {
        create_plan(
            &ctx.db,
            &input.name,
            input.description.as_deref().unwrap_or(""),
            input.status.unwrap_or(PlanStatus::Backlog),
        )
        .await
    }
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct UpdateInput {
    #[schemars(description = "Plan id: short key 'PL-1' (case-insensitive) or the full UUID.")]
    pub plan_id: String,
    #[serde(default)]
    pub patch: Option<Value>,
    #[serde(flatten)]
    pub flat: PlanPatch,
    pub expected_updated_at: Option<String>,
}

pub struct PlansUpdate;

impl Op for PlansUpdate {
    const NAME: OpName = OpName::PlansUpdate;
    const KIND: Kind = Kind::Command;
    const MCP: bool = true;

    type Input = UpdateInput;
    type Output = Plan;

    fn description() -> &'static str {
        crate::descriptions::PLANS_UPDATE
    }

    fn entity() -> Option<Entity> {
        Some(Entity::Plans)
    }

    async fn run(ctx: &Ctx, input: Self::Input) -> Result<Self::Output> {
        let patch: PlanPatch = match input.patch {
            Some(value) => serde_json::from_value(value)
                .map_err(|error| AppError::validation(error.to_string()))?,
            None => input.flat,
        };
        update_plan(
            &ctx.db,
            &input.plan_id,
            &patch,
            input.expected_updated_at.as_deref(),
        )
        .await
    }
}

pub struct PlansDelete;

impl Op for PlansDelete {
    const NAME: OpName = OpName::PlansDelete;
    const KIND: Kind = Kind::Command;
    const MCP: bool = true;
    const LAZY: bool = true;

    type Input = PlanIdInput;
    type Output = Plan;

    fn description() -> &'static str {
        crate::descriptions::PLANS_DELETE
    }

    fn entity() -> Option<Entity> {
        Some(Entity::Plans)
    }

    async fn run(ctx: &Ctx, input: Self::Input) -> Result<Self::Output> {
        delete_plan(&ctx.db, &input.plan_id).await
    }
}

pub struct PlansRestore;

impl Op for PlansRestore {
    const NAME: OpName = OpName::PlansRestore;
    const KIND: Kind = Kind::Command;
    const MCP: bool = true;
    const LAZY: bool = true;

    type Input = PlanIdInput;
    type Output = Plan;

    fn description() -> &'static str {
        crate::descriptions::PLANS_RESTORE
    }

    fn entity() -> Option<Entity> {
        Some(Entity::Plans)
    }

    async fn run(ctx: &Ctx, input: Self::Input) -> Result<Self::Output> {
        restore_plan(&ctx.db, &input.plan_id).await
    }
}

pub struct PlansDeletedList;

impl Op for PlansDeletedList {
    const NAME: OpName = OpName::PlansDeletedList;
    const KIND: Kind = Kind::Query;
    const MCP: bool = true;
    const LAZY: bool = true;

    type Input = EmptyInput;
    type Output = Items<Plan>;

    fn description() -> &'static str {
        crate::descriptions::PLANS_DELETED_LIST
    }

    async fn run(ctx: &Ctx, _input: Self::Input) -> Result<Self::Output> {
        Ok(Items {
            items: list_deleted_plans(&ctx.db).await?,
        })
    }
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct ItemInput {
    #[schemars(description = "Plan id: short key 'PL-1' (case-insensitive) or the full UUID.")]
    pub plan_id: String,
    #[schemars(description = "Full task id, e.g. 'LOG-42'.")]
    pub task_id: String,
}

pub struct PlansItemsAdd;

impl Op for PlansItemsAdd {
    const NAME: OpName = OpName::PlansItemsAdd;
    const KIND: Kind = Kind::Command;
    const MCP: bool = true;

    type Input = ItemInput;
    type Output = PlanItem;

    fn description() -> &'static str {
        crate::descriptions::PLANS_ITEMS_ADD
    }

    fn entity() -> Option<Entity> {
        Some(Entity::Plans)
    }

    async fn run(ctx: &Ctx, input: Self::Input) -> Result<Self::Output> {
        add_plan_item(&ctx.db, &input.plan_id, &input.task_id).await
    }
}

pub struct PlansItemsRemove;

impl Op for PlansItemsRemove {
    const NAME: OpName = OpName::PlansItemsRemove;
    const KIND: Kind = Kind::Command;
    const MCP: bool = true;

    type Input = ItemInput;
    type Output = Option<PlanItem>;

    fn description() -> &'static str {
        crate::descriptions::PLANS_ITEMS_REMOVE
    }

    fn entity() -> Option<Entity> {
        Some(Entity::Plans)
    }

    async fn run(ctx: &Ctx, input: Self::Input) -> Result<Self::Output> {
        remove_plan_item(&ctx.db, &input.plan_id, &input.task_id).await
    }
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct ReorderInput {
    #[schemars(description = "Plan id: short key 'PL-1' (case-insensitive) or the full UUID.")]
    pub plan_id: String,
    #[schemars(
        description = "Every task id of the plan in the new order, full 'PREFIX-NUMBER' ids."
    )]
    pub task_ids: Vec<String>,
}

pub struct PlansReorder;

impl Op for PlansReorder {
    const NAME: OpName = OpName::PlansReorder;
    const KIND: Kind = Kind::Command;
    const MCP: bool = true;

    type Input = ReorderInput;
    type Output = Items<PlanItem>;

    fn description() -> &'static str {
        crate::descriptions::PLANS_REORDER
    }

    fn entity() -> Option<Entity> {
        Some(Entity::Plans)
    }

    async fn run(ctx: &Ctx, input: Self::Input) -> Result<Self::Output> {
        Ok(Items {
            items: reorder_plan_items(&ctx.db, &input.plan_id, &input.task_ids).await?,
        })
    }
}

pub struct PlansNotesList;

impl Op for PlansNotesList {
    const NAME: OpName = OpName::PlansNotesList;
    const KIND: Kind = Kind::Query;
    const MCP: bool = true;

    type Input = PlanIdInput;
    type Output = Items<PlanNote>;

    fn description() -> &'static str {
        crate::descriptions::PLANS_NOTES_LIST
    }

    async fn run(ctx: &Ctx, input: Self::Input) -> Result<Self::Output> {
        Ok(Items {
            items: list_plan_notes(&ctx.db, &input.plan_id).await?,
        })
    }
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct NoteInput {
    #[schemars(description = "Plan id: short key 'PL-1' (case-insensitive) or the full UUID.")]
    pub plan_id: String,
    #[schemars(description = "Full task id, e.g. 'LOG-42'.")]
    pub task_id: String,
    pub body: String,
}

pub struct PlansNotesAdd;

impl Op for PlansNotesAdd {
    const NAME: OpName = OpName::PlansNotesAdd;
    const KIND: Kind = Kind::Command;
    const MCP: bool = true;

    type Input = NoteInput;
    type Output = PlanNote;

    fn description() -> &'static str {
        crate::descriptions::PLANS_NOTES_ADD
    }

    fn entity() -> Option<Entity> {
        Some(Entity::Plans)
    }

    async fn run(ctx: &Ctx, input: Self::Input) -> Result<Self::Output> {
        add_plan_note(&ctx.db, &input.plan_id, &input.task_id, &input.body).await
    }
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct EditNoteInput {
    pub note_id: String,
    pub body: String,
    #[schemars(
        description = "Expected current note version: edited_at, or created_at before the first edit. Pass it to reject a stale edit."
    )]
    pub expected_edited_at: Option<String>,
}

pub struct PlansNotesEdit;

impl Op for PlansNotesEdit {
    const NAME: OpName = OpName::PlansNotesEdit;
    const KIND: Kind = Kind::Command;
    const MCP: bool = true;

    type Input = EditNoteInput;
    type Output = PlanNote;

    fn description() -> &'static str {
        crate::descriptions::PLANS_NOTES_EDIT
    }

    fn entity() -> Option<Entity> {
        Some(Entity::Plans)
    }

    async fn run(ctx: &Ctx, input: Self::Input) -> Result<Self::Output> {
        edit_plan_note(
            &ctx.db,
            &input.note_id,
            &input.body,
            input.expected_edited_at.as_deref(),
        )
        .await
    }
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct DeleteNoteInput {
    pub note_id: String,
}

pub struct PlansNotesDelete;

impl Op for PlansNotesDelete {
    const NAME: OpName = OpName::PlansNotesDelete;
    const KIND: Kind = Kind::Command;
    const MCP: bool = true;
    const LAZY: bool = true;

    type Input = DeleteNoteInput;
    type Output = PlanNote;

    fn description() -> &'static str {
        crate::descriptions::PLANS_NOTES_DELETE
    }

    fn entity() -> Option<Entity> {
        Some(Entity::Plans)
    }

    async fn run(ctx: &Ctx, input: Self::Input) -> Result<Self::Output> {
        delete_plan_note(&ctx.db, &input.note_id).await
    }
}

pub struct PlansNotesRestore;

impl Op for PlansNotesRestore {
    const NAME: OpName = OpName::PlansNotesRestore;
    const KIND: Kind = Kind::Command;
    const MCP: bool = true;
    const LAZY: bool = true;

    type Input = DeleteNoteInput;
    type Output = PlanNote;

    fn description() -> &'static str {
        crate::descriptions::PLANS_NOTES_RESTORE
    }

    fn entity() -> Option<Entity> {
        Some(Entity::Plans)
    }

    async fn run(ctx: &Ctx, input: Self::Input) -> Result<Self::Output> {
        restore_plan_note(&ctx.db, &input.note_id).await
    }
}

pub struct PlansNotesDeletedList;

impl Op for PlansNotesDeletedList {
    const NAME: OpName = OpName::PlansNotesDeletedList;
    const KIND: Kind = Kind::Query;
    const MCP: bool = true;
    const LAZY: bool = true;

    type Input = PlanIdInput;
    type Output = Items<PlanNote>;

    fn description() -> &'static str {
        crate::descriptions::PLANS_NOTES_DELETED_LIST
    }

    async fn run(ctx: &Ctx, input: Self::Input) -> Result<Self::Output> {
        Ok(Items {
            items: list_deleted_plan_notes(&ctx.db, &input.plan_id).await?,
        })
    }
}

pub struct PlansNotesRevisionsList;

impl Op for PlansNotesRevisionsList {
    const NAME: OpName = OpName::PlansNotesRevisionsList;
    const KIND: Kind = Kind::Query;
    const MCP: bool = true;
    const LAZY: bool = true;

    type Input = DeleteNoteInput;
    type Output = Items<TextRevision>;

    fn description() -> &'static str {
        crate::descriptions::PLANS_NOTES_REVISIONS_LIST
    }

    async fn run(ctx: &Ctx, input: Self::Input) -> Result<Self::Output> {
        Ok(Items {
            items: list_plan_note_revisions(&ctx.db, &input.note_id).await?,
        })
    }
}
