#![forbid(unsafe_code)]

use std::{future::Future, sync::Arc};

use serde::{Serialize, de::DeserializeOwned};
use xboct_log_core::{Db, Entity, Events, Result};

pub mod activity;
mod descriptions;
pub mod tasks;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Kind {
    Query,
    Command,
}

#[derive(Debug, Clone)]
pub struct OpInfo {
    pub name: &'static str,
    pub kind: Kind,
    pub mcp: bool,
    pub description: &'static str,
    pub entity: Option<Entity>,
}

pub struct Ctx {
    pub db: Arc<Db>,
    pub events: Arc<Events>,
}

pub trait Op {
    const NAME: &'static str;
    const KIND: Kind;
    const MCP: bool;

    type Input: DeserializeOwned + Send;
    type Output: Serialize + Send;

    fn description() -> &'static str;

    fn entity() -> Option<Entity> {
        None
    }

    fn run(ctx: &Ctx, input: Self::Input) -> impl Future<Output = Result<Self::Output>> + Send;
}

#[macro_export]
macro_rules! ops {
	($($op:ty),+ $(,)?) => {
		pub fn metadata() -> ::std::vec::Vec<$crate::OpInfo> {
			::std::vec![
				$($crate::OpInfo {
					name: <$op as $crate::Op>::NAME,
					kind: <$op as $crate::Op>::KIND,
					mcp: <$op as $crate::Op>::MCP,
					description: <$op as $crate::Op>::description(),
					entity: <$op as $crate::Op>::entity(),
				}),+
			]
		}

		pub async fn dispatch(
			ctx: &$crate::Ctx,
			name: &str,
			input: ::serde_json::Value,
		) -> ::xboct_log_core::Result<::serde_json::Value> {
			match name {
				$(<$op as $crate::Op>::NAME => {
					let input = ::serde_json::from_value::<<$op as $crate::Op>::Input>(input)
						.map_err(|error| ::xboct_log_core::AppError::validation(error.to_string()))?;
					let output = <$op as $crate::Op>::run(ctx, input).await?;
					::serde_json::to_value(output)
						.map_err(|error| ::xboct_log_core::AppError::unexpected(error.to_string()))
				}),+,
				_ => ::std::result::Result::Err(
					::xboct_log_core::AppError::not_found(format!("no operation named {name}")),
				),
			}
		}
	};
}

pub use activity::{ActivitiesList, TasksHistory};
pub use tasks::{
    TasksAddBlocker, TasksAddLink, TasksClose, TasksCloseMany, TasksCreate, TasksCreateMany,
    TasksDelete, TasksDeletedList, TasksGet, TasksGetMany, TasksList, TasksMove, TasksOptions,
    TasksRemoveBlocker, TasksRemoveLink, TasksRestore, TasksRevisionsList, TasksStats, TasksUpdate,
    TasksUpdateMany,
};

crate::ops![
    TasksList,
    TasksGet,
    TasksCreate,
    TasksUpdate,
    TasksClose,
    TasksDelete,
    TasksRestore,
    TasksMove,
    TasksAddLink,
    TasksRemoveLink,
    TasksAddBlocker,
    TasksRemoveBlocker,
    TasksCreateMany,
    TasksUpdateMany,
    TasksOptions,
    TasksStats,
    TasksRevisionsList,
    TasksDeletedList,
    TasksGetMany,
    TasksCloseMany,
    TasksHistory,
    ActivitiesList,
];
