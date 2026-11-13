use serde::Deserialize;
use xboct_log_core::{
    AppError, Entity, NewProject, Project, ProjectDetails, ProjectPatch, ProjectWithCounts, Result,
    create_project, get_project, list_projects, normalize_repo, project_details,
    project_with_counts, repo_error, update_project,
};

use crate::{Ctx, Kind, Op};

#[derive(Debug, Default, Deserialize)]
#[serde(default, deny_unknown_fields, rename_all = "camelCase")]
pub struct ListInput {
    pub include_archived: Option<bool>,
    pub q: Option<String>,
    pub repo: Option<String>,
}

pub struct ProjectsList;

impl Op for ProjectsList {
    const NAME: &'static str = "projects_list";
    const KIND: Kind = Kind::Query;
    const MCP: bool = true;

    type Input = ListInput;
    type Output = Vec<ProjectWithCounts>;

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
        Ok(projects)
    }
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct GetInput {
    pub project_id: String,
}

pub struct ProjectsGet;

impl Op for ProjectsGet {
    const NAME: &'static str = "projects_get";
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

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CreateInput {
    pub project_id: String,
    pub name: String,
    pub prefix: String,
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
    const NAME: &'static str = "projects_create";
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

#[derive(Debug, Default, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct PatchInput {
    pub name: Option<String>,
    pub archived: Option<bool>,
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

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct UpdateInput {
    pub project_id: String,
    pub patch: PatchInput,
}

pub struct ProjectsUpdate;

impl Op for ProjectsUpdate {
    const NAME: &'static str = "projects_update";
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
