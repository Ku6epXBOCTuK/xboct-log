use xboct_log_core::{
    RequestLogExport as ExportResult, RequestLogPage, RequestLogSearch, Result, export_request_log,
    search_request_log, validate_request_log_search,
};

use crate::{Ctx, Kind, Op, OpName};

pub struct RequestLogList;

impl Op for RequestLogList {
    const NAME: OpName = OpName::RequestLogList;
    const KIND: Kind = Kind::Query;
    const MCP: bool = true;
    type Input = RequestLogSearch;
    type Output = RequestLogPage;

    fn description() -> &'static str {
        crate::descriptions::REQUEST_LOG_LIST
    }

    async fn run(ctx: &Ctx, input: Self::Input) -> Result<Self::Output> {
        validate_request_log_search(&input)?;
        search_request_log(&ctx.db, &input).await
    }
}

pub struct RequestLogExport;

impl Op for RequestLogExport {
    const NAME: OpName = OpName::RequestLogExport;
    const KIND: Kind = Kind::Query;
    const MCP: bool = true;
    type Input = RequestLogSearch;
    type Output = ExportResult;

    fn description() -> &'static str {
        crate::descriptions::REQUEST_LOG_EXPORT
    }

    async fn run(ctx: &Ctx, input: Self::Input) -> Result<Self::Output> {
        validate_request_log_search(&input)?;
        export_request_log(&ctx.db, &input).await
    }
}
