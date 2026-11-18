use schemars::JsonSchema;

use serde::Deserialize;
use xboct_log_core::{
    AppError, Entity, NewProject, OpName, Project, ProjectDetails, ProjectPatch, ProjectWithCounts,
    Result, create_project, get_project, list_projects, normalize_repo, project_details,
    project_with_counts, repo_error, update_project,
};

use crate::{Ctx, Items, Kind, Op};

#[derive(Debug, Default, Deserialize, JsonSchema)]
#[serde(default, deny_unknown_fields, rename_all = "camelCase")]
pub struct ListInput {
    pub include_archived: Option<bool>,
    #[schemars(
        description = "Case-insensitive substring match on the project name, id, prefix or repo."
    )]
    pub q: Option<String>,
    #[schemars(
        description = "Exact repository lookup, canonical host/owner/name. Accepts a git URL and normalizes it."
    )]
    pub repo: Option<String>,
}

pub struct ProjectsList;

impl Op for ProjectsList {
    const NAME: OpName = OpName::ProjectsList;
    const KIND: Kind = Kind::Query;
    const MCP: bool = true;

    type Input = ListInput;
    type Output = Items<ProjectWithCounts>;

    fn description() -> &'static str {
        crate::descriptions::PROJECTS_LIST
    }

    async fn run(ctx: &Ctx, input: Self::Input) -> Result<Self::Output> {
        let repo = match input.repo {
            None => None,
            Some(raw) => {
                if let Some(message) = repo_error(&raw) {
                    return Err(AppError::validation(message));
                }
                match normalize_repo(&raw) {
                    Some(normalized) => Some(normalized.to_lowercase()),
                    None => {
                        return Err(AppError::validation(
                            "Repository must look like host/owner/name",
                        ));
                    }
                }
            }
        };
        let query = input
            .q
            .map(|value| value.trim().to_lowercase())
            .filter(|value| !value.is_empty());

        let mut projects = Vec::new();
        for project in list_projects(&ctx.db, input.include_archived.unwrap_or(false)).await? {
            let matches_repo = match &repo {
                None => true,
                Some(repo) => project.repo.as_deref().unwrap_or_default().to_lowercase() == *repo,
            };
            if !matches_repo {
                continue;
            }
            let matches_query = match &query {
                None => true,
                Some(query) => {
                    project.id.as_str().to_lowercase().contains(query)
                        || project.name.to_lowercase().contains(query)
                        || project.prefix.as_str().to_lowercase().contains(query)
                        || project
                            .repo
                            .as_deref()
                            .unwrap_or_default()
                            .to_lowercase()
                            .contains(query)
                }
            };
            if !matches_query {
                continue;
            }
            projects.push(project_with_counts(&ctx.db, project).await?);
        }
        Ok(Items { items: projects })
    }
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct GetInput {
    pub project_id: String,
}

pub struct ProjectsGet;

impl Op for ProjectsGet {
    const NAME: OpName = OpName::ProjectsGet;
    const KIND: Kind = Kind::Query;
    const MCP: bool = true;

    type Input = GetInput;
    type Output = ProjectDetails;

    fn description() -> &'static str {
        crate::descriptions::PROJECTS_GET
    }

    async fn run(ctx: &Ctx, input: Self::Input) -> Result<Self::Output> {
        let project_id = input.project_id.trim();
        if project_id.is_empty() {
            return Err(AppError::validation("project_id must not be empty"));
        }
        let project = get_project(&ctx.db, project_id)
            .await?
            .ok_or_else(|| AppError::not_found(format!("project {project_id} not found")))?;
        project_details(&ctx.db, project).await
    }
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct CreateInput {
    pub project_id: String,
    pub name: String,
    pub prefix: String,
    #[schemars(
        description = "Git repository as host/owner/name; a full URL or SSH form is normalized. Optional."
    )]
    pub repo: Option<Option<String>>,
}

impl From<CreateInput> for NewProject {
    fn from(input: CreateInput) -> Self {
        Self {
            id: input.project_id,
            name: input.name,
            prefix: input.prefix,
            repo: input.repo,
        }
    }
}

pub struct ProjectsCreate;

impl Op for ProjectsCreate {
    const NAME: OpName = OpName::ProjectsCreate;
    const KIND: Kind = Kind::Command;
    const MCP: bool = true;

    type Input = CreateInput;
    type Output = Project;

    fn description() -> &'static str {
        crate::descriptions::PROJECTS_CREATE
    }

    fn entity() -> Option<Entity> {
        Some(Entity::Projects)
    }

    async fn run(ctx: &Ctx, input: Self::Input) -> Result<Self::Output> {
        create_project(&ctx.db, input.into()).await
    }
}

#[derive(Debug, Default, Deserialize, JsonSchema)]
#[serde(default, deny_unknown_fields)]
pub struct PatchInput {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub archived: Option<bool>,
    #[serde(default)]
    #[schemars(
        description = "Git repository as host/owner/name; a full URL or SSH form is normalized. null clears it."
    )]
    pub repo: Option<Option<String>>,
}

impl From<PatchInput> for ProjectPatch {
    fn from(input: PatchInput) -> Self {
        Self {
            name: input.name,
            archived: input.archived,
            repo: input.repo,
        }
    }
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct UpdateInput {
    pub project_id: String,
    pub patch: PatchInput,
}

pub struct ProjectsUpdate;

impl Op for ProjectsUpdate {
    const NAME: OpName = OpName::ProjectsUpdate;
    const KIND: Kind = Kind::Command;
    const MCP: bool = true;

    type Input = UpdateInput;
    type Output = Project;

    fn description() -> &'static str {
        crate::descriptions::PROJECTS_UPDATE
    }

    fn entity() -> Option<Entity> {
        Some(Entity::Projects)
    }

    async fn run(ctx: &Ctx, input: Self::Input) -> Result<Self::Output> {
        update_project(&ctx.db, input.project_id.trim(), input.patch.into()).await
    }
}
