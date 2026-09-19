pub mod caldir;
pub mod config;
pub mod error;
pub mod omarchy;
pub mod platform;
pub mod plugins;
pub mod themes;

pub type TauResult<T> = Result<T, error::RpcError>;
