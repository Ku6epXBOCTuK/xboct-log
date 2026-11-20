use schemars::JsonSchema;

use serde::Deserialize;
use xboct_log_core::{
    AppError, Entity, OpName, ProjectId, Result, Scope, ScopeDeleteReport, ScopeId,
    ScopeWithCounts, count_tasks_by_scope, create_scope, delete_scope_detailed, get_scope,
    list_scopes, preview_scope_delete, scoped_project_ids, update_scope,
};

use crate::{Ctx, EmptyInput, Items, Kind, Op};

fn required_project(value: &str) -> Result<ProjectId> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(AppError::validation("project_id must not be empty"));
    }
    Ok(ProjectId::new(trimmed))
}

#[derive(Debug, Default, Deserialize, JsonSchema)]
#[serde(default, deny_unknown_fields)]
pub struct ListInput {
    pub project_id: Option<String>,
}

pub struct ScopesList;

impl Op for ScopesList {
    const NAME: OpName = OpName::ScopesList;
    const KIND: Kind = Kind::Query;
    const MCP: bool = true;

    type Input = ListInput;
    type Output = Items<ScopeWithCounts>;

    fn description() -> &'static str {
        crate::descriptions::SCOPES_LIST
    }

    async fn run(ctx: &Ctx, input: Self::Input) -> Result<Self::Output> {
        let project = input
            .project_id
            .as_deref()
            .map(required_project)
            .transpose()?;
        let counts = count_tasks_by_scope(&ctx.db, project.as_ref()).await?;
        let scopes = list_scopes(&ctx.db, project.as_ref()).await?;
        Ok(Items {
            items: scopes
                .into_iter()
                .map(|scope| {
                    let count = counts.get(&scope.id.get()).copied().unwrap_or_default();
                    ScopeWithCounts::new(scope, count)
                })
                .collect(),
        })
    }
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct GetInput {
    pub scope_id: ScopeId,
}

pub struct ScopesGet;

impl Op for ScopesGet {
    const NAME: OpName = OpName::ScopesGet;
    const KIND: Kind = Kind::Query;
    const MCP: bool = true;

    type Input = GetInput;
    type Output = ScopeWithCounts;

    fn description() -> &'static str {
        crate::descriptions::SCOPES_GET
    }

    async fn run(ctx: &Ctx, input: Self::Input) -> Result<Self::Output> {
        let scope = get_scope(&ctx.db, input.scope_id)
            .await?
            .ok_or_else(|| AppError::not_found(format!("scope {} not found", input.scope_id)))?;
        let counts = count_tasks_by_scope(&ctx.db, None).await?;
        let count = counts.get(&scope.id.get()).copied().unwrap_or_default();
        Ok(ScopeWithCounts::new(scope, count))
    }
}

pub struct ScopesProjectIds;

impl Op for ScopesProjectIds {
    const NAME: OpName = OpName::ScopesProjectIds;
    const KIND: Kind = Kind::Query;
    const MCP: bool = true;

    type Input = EmptyInput;
    type Output = Items<ProjectId>;

    fn description() -> &'static str {
        crate::descriptions::SCOPES_PROJECT_IDS
    }

    async fn run(ctx: &Ctx, _input: Self::Input) -> Result<Self::Output> {
        let items = scoped_project_ids(&ctx.db).await?;
        Ok(Items { items })
    }
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct CreateInput {
    pub project_id: String,
    pub name: String,
}

pub struct ScopesCreate;

impl Op for ScopesCreate {
    const NAME: OpName = OpName::ScopesCreate;
    const KIND: Kind = Kind::Command;
    const MCP: bool = true;

    type Input = CreateInput;
    type Output = Scope;

    fn description() -> &'static str {
        crate::descriptions::SCOPES_CREATE
    }

    fn entity() -> Option<Entity> {
        Some(Entity::Scopes)
    }

    async fn run(ctx: &Ctx, input: Self::Input) -> Result<Self::Output> {
        let project = required_project(&input.project_id)?;
        create_scope(&ctx.db, &project, &input.name).await
    }
}

#[derive(Debug, Default, Deserialize, JsonSchema)]
#[serde(default, deny_unknown_fields)]
pub struct PatchInput {
    pub name: Option<String>,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct UpdateInput {
    pub scope_id: ScopeId,
    pub patch: PatchInput,
}

pub struct ScopesUpdate;

impl Op for ScopesUpdate {
    const NAME: OpName = OpName::ScopesUpdate;
    const KIND: Kind = Kind::Command;
    const MCP: bool = true;

    type Input = UpdateInput;
    type Output = Scope;

    fn description() -> &'static str {
        crate::descriptions::SCOPES_UPDATE
    }

    fn entity() -> Option<Entity> {
        Some(Entity::Scopes)
    }

    async fn run(ctx: &Ctx, input: Self::Input) -> Result<Self::Output> {
        update_scope(&ctx.db, input.scope_id, input.patch.name.as_deref()).await
    }
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct DeleteInput {
    pub scope_id: ScopeId,
    #[schemars(
        description = "Preview the deletion instead of performing it: returns the scope and the ids of the tasks and epics that would lose the scope."
    )]
    pub dry_run: Option<bool>,
}

pub struct ScopesDelete;

impl Op for ScopesDelete {
    const NAME: OpName = OpName::ScopesDelete;
    const KIND: Kind = Kind::Command;
    const MCP: bool = true;

    type Input = DeleteInput;
    type Output = ScopeDeleteReport;

    fn description() -> &'static str {
        crate::descriptions::SCOPES_DELETE
    }

    fn entity() -> Option<Entity> {
        Some(Entity::Scopes)
    }

    async fn run(ctx: &Ctx, input: Self::Input) -> Result<Self::Output> {
        if input.dry_run.unwrap_or(false) {
            return preview_scope_delete(&ctx.db, input.scope_id).await;
        }
        delete_scope_detailed(&ctx.db, input.scope_id).await
    }
}
