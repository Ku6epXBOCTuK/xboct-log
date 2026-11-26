use super::*;

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
