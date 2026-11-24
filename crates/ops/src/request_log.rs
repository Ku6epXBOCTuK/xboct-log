use schemars::JsonSchema;
use serde::Deserialize;
use xboct_log_core::{
    DEFAULT_LIMIT, Limit, MAX_LIMIT, Offset, RequestLogExport as ExportResult, RequestLogFilter,
    RequestLogPage, RequestStatus, Result, export_request_log, search_request_log, validate_limit,
    validate_offset,
};

use crate::{Ctx, Kind, Op, OpName};

const EXPORT_DEFAULT_LIMIT: i64 = 10_000;
const EXPORT_MAX_LIMIT: i64 = 10_000;

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct RequestLogListInput {
    #[schemars(description = "Tool name, for example tasks_list.")]
    #[serde(default)]
    pub op: Option<String>,
    #[schemars(description = "Only successful or only failed calls.")]
    #[serde(default)]
    pub status: Option<RequestStatus>,
    #[schemars(description = "MCP client label.")]
    #[serde(default)]
    pub client: Option<String>,
    #[schemars(description = "Fingerprint of the tool name and parameters, for repeated calls.")]
    #[serde(default)]
    pub params_hash: Option<String>,
    #[schemars(description = "Start of the period as an ISO date-time.")]
    #[serde(default)]
    pub from: Option<String>,
    #[schemars(description = "End of the period as an ISO date-time.")]
    #[serde(default)]
    pub to: Option<String>,
    #[schemars(
        description = "Maximum number of calls to return (default 50, max 200).",
        range(min = 1, max = 200)
    )]
    #[serde(default)]
    pub limit: Option<i64>,
    #[schemars(description = "Number of calls to skip, for pagination.")]
    #[serde(default)]
    pub offset: Option<i64>,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct RequestLogExportInput {
    #[schemars(description = "Tool name, for example tasks_list.")]
    #[serde(default)]
    pub op: Option<String>,
    #[schemars(description = "Only successful or only failed calls.")]
    #[serde(default)]
    pub status: Option<RequestStatus>,
    #[schemars(description = "MCP client label.")]
    #[serde(default)]
    pub client: Option<String>,
    #[schemars(description = "Fingerprint of the tool name and parameters, for repeated calls.")]
    #[serde(default)]
    pub params_hash: Option<String>,
    #[schemars(description = "Start of the period as an ISO date-time.")]
    #[serde(default)]
    pub from: Option<String>,
    #[schemars(description = "End of the period as an ISO date-time.")]
    #[serde(default)]
    pub to: Option<String>,
    #[schemars(
        description = "Maximum number of calls to return (default 10000, max 10000).",
        range(min = 1, max = 10000)
    )]
    #[serde(default)]
    pub limit: Option<i64>,
    #[schemars(description = "Number of calls to skip, for pagination.")]
    #[serde(default)]
    pub offset: Option<i64>,
}

fn paginate(
    limit: Option<i64>,
    offset: Option<i64>,
    default: i64,
    max: i64,
) -> Result<(Limit, Offset)> {
    Ok((
        validate_limit(limit, default, max)?,
        validate_offset(offset)?,
    ))
}

impl RequestLogListInput {
    fn into_parts(self) -> Result<(RequestLogFilter, Limit, Offset)> {
        let filter = RequestLogFilter {
            op: self.op,
            status: self.status,
            client: self.client,
            params_hash: self.params_hash,
            from: self.from,
            to: self.to,
        };
        let (limit, offset) = paginate(self.limit, self.offset, DEFAULT_LIMIT, MAX_LIMIT)?;
        Ok((filter, limit, offset))
    }
}

impl RequestLogExportInput {
    fn into_parts(self) -> Result<(RequestLogFilter, Limit, Offset)> {
        let filter = RequestLogFilter {
            op: self.op,
            status: self.status,
            client: self.client,
            params_hash: self.params_hash,
            from: self.from,
            to: self.to,
        };
        let (limit, offset) = paginate(
            self.limit,
            self.offset,
            EXPORT_DEFAULT_LIMIT,
            EXPORT_MAX_LIMIT,
        )?;
        Ok((filter, limit, offset))
    }
}

pub struct RequestLogList;

impl Op for RequestLogList {
    const NAME: OpName = OpName::RequestLogList;
    const KIND: Kind = Kind::Query;
    const MCP: bool = true;
    const LAZY: bool = true;
    type Input = RequestLogListInput;
    type Output = RequestLogPage;

    fn description() -> &'static str {
        crate::descriptions::REQUEST_LOG_LIST
    }

    async fn run(ctx: &Ctx, input: Self::Input) -> Result<Self::Output> {
        let (filter, limit, offset) = input.into_parts()?;
        search_request_log(&ctx.db, &filter, limit, offset).await
    }
}

pub struct RequestLogExport;

impl Op for RequestLogExport {
    const NAME: OpName = OpName::RequestLogExport;
    const KIND: Kind = Kind::Query;
    const MCP: bool = true;
    const LAZY: bool = true;
    type Input = RequestLogExportInput;
    type Output = ExportResult;

    fn description() -> &'static str {
        crate::descriptions::REQUEST_LOG_EXPORT
    }

    async fn run(ctx: &Ctx, input: Self::Input) -> Result<Self::Output> {
        let (filter, limit, offset) = input.into_parts()?;
        export_request_log(&ctx.db, &filter, limit, offset).await
    }
}
