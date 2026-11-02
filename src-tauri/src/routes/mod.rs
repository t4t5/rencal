pub mod agents;
pub mod caldir;
pub mod commands;
pub mod config;
pub mod error;
pub mod keys;
pub mod omarchy;
pub mod platform;
pub mod plugins;
pub mod themes;
pub mod views;

pub type TauResult<T> = Result<T, error::RpcError>;
