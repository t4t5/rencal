//! Stable failure categories for backend operations. Classify concrete causes
//! before adding operation context. The Tauri app serializes this object
//! directly as the rejected invoke value (exported to TypeScript as `RpcError`).
//! Shared crates retain their own errors and never depend on this boundary.

use caldir_core::{
    CaldirConfigError, CaldirError, CalendarConfigError, CalendarError, CalendarEventError,
    CalendarStateError, ConnectionError, EventError, ProviderError, ProviderTransportError,
    RemoteError,
};
use rencal_config::ConfigError;
use serde::Serialize;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[cfg_attr(
    feature = "specta",
    derive(specta::Type),
    specta(rename = "RpcErrorKind")
)]
#[serde(rename_all = "snake_case")]
pub enum CoreErrorKind {
    CalendarNotFound,
    EventNotFound,
    ProviderNotFound,
    ProviderFailure,
    InvalidInput,
    Conflict,
    Configuration,
    Authentication,
    Network,
    RateLimited,
    MissingRelease,
    Incompatible,
    InvalidPackage,
    Io,
    Internal,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[cfg_attr(feature = "specta", derive(specta::Type), specta(rename = "RpcError"))]
pub struct CoreError {
    pub kind: CoreErrorKind,
    pub message: String,
}

pub type CoreResult<T> = Result<T, CoreError>;

impl CoreError {
    pub fn new(kind: CoreErrorKind, message: impl Into<String>) -> Self {
        Self {
            kind,
            message: message.into(),
        }
    }

    pub fn context(mut self, context: impl std::fmt::Display) -> Self {
        self.message = format!("{context}: {}", self.message);
        self
    }
}

impl std::fmt::Display for CoreError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.message)
    }
}

impl std::error::Error for CoreError {}

// Classify before formatting the full error chain at the RPC boundary.
macro_rules! map_error {
    ($ty:ty, $error:ident => $kind:expr) => {
        impl From<&$ty> for CoreErrorKind {
            fn from($error: &$ty) -> Self {
                $kind
            }
        }
        impl From<$ty> for CoreError {
            fn from(error: $ty) -> Self {
                Self::new(
                    CoreErrorKind::from(&error),
                    format!("{:#}", anyhow::Error::new(error)),
                )
            }
        }
    };
}

map_error!(CaldirError, e => match e {
    CaldirError::Calendar(e) => e.into(),
    CaldirError::Provider(e) => e.into(),
    CaldirError::Config(e) => e.into(),
    CaldirError::NoDefaultCalendar => Self::Configuration,
    _ => Self::Internal,
});
map_error!(CalendarError, e => match e {
    CalendarError::AlreadyExists(_) => Self::Conflict,
    CalendarError::NotFound(_) => Self::CalendarNotFound,
    CalendarError::MasterNotFound(_) => Self::EventNotFound,
    CalendarError::NotRecurring(_) => Self::InvalidInput,
    CalendarError::Io(e) => e.into(),
    CalendarError::Config(e) => e.into(),
    CalendarError::State(e) => e.into(),
    CalendarError::Event(e) => e.into(),
    _ => Self::Internal,
});
map_error!(CalendarEventError, e => match e {
    CalendarEventError::NotFound(_) => Self::EventNotFound,
    CalendarEventError::Io(e) | CalendarEventError::Read(_, e) | CalendarEventError::Delete(_, e) => e.into(),
    CalendarEventError::Event(e) | CalendarEventError::InvalidEvent(_, e) => e.into(),
    CalendarEventError::ExpectedSingleEvent { .. } | CalendarEventError::NotRecurring(_) => Self::InvalidInput,
    _ => Self::Internal,
});
map_error!(EventError, e => match e {
    EventError::Io(_, e) => e.into(),
    EventError::InvalidIcs(..) | EventError::UnexpectedEventCount { .. }
    | EventError::MissingStart | EventError::MissingUid | EventError::AttendeeNotFound { .. } => Self::InvalidInput,
    _ => Self::Internal,
});
map_error!(CalendarStateError, e => match e {
    CalendarStateError::Io(e) => e.into(),
    CalendarStateError::InvalidEvent(e) => e.into(),
    _ => Self::Internal,
});
map_error!(CalendarConfigError, e => match e {
    CalendarConfigError::Io(e) | CalendarConfigError::Read(_, e) | CalendarConfigError::Write(_, e) => e.into(),
    _ => Self::Configuration,
});
map_error!(CaldirConfigError, e => match e {
    CaldirConfigError::Io(e) | CaldirConfigError::Read(_, e) | CaldirConfigError::Write(_, e) => e.into(),
    _ => Self::Configuration,
});
map_error!(ProviderError, e => match e {
    ProviderError::ProviderNotFound(_) => Self::ProviderNotFound,
    ProviderError::NotExecutable(_) | ProviderError::InvalidProviderFilename(_) => Self::Configuration,
    ProviderError::Transport(e) | ProviderError::TransportFor(_, e) => e.into(),
    _ => Self::ProviderFailure,
});
map_error!(ProviderTransportError, e => match e {
    ProviderTransportError::Spawn(e) | ProviderTransportError::SpawnBinary(_, e)
        if e.kind() == std::io::ErrorKind::NotFound => Self::ProviderNotFound,
    ProviderTransportError::Spawn(_) | ProviderTransportError::SpawnBinary(..) | ProviderTransportError::Io(_) => Self::Io,
    _ => Self::ProviderFailure,
});
map_error!(ConnectionError, e => match e {
    ConnectionError::Remote(e) => e.into(),
    ConnectionError::Calendar(e) => e.into(),
    _ => Self::Internal,
});
map_error!(RemoteError, e => match e {
    RemoteError::Provider(e) | RemoteError::CreateEvent(_, e)
    | RemoteError::UpdateEvent(_, e) | RemoteError::DeleteEvent(_, e) => e.into(),
    _ => Self::Internal,
});
map_error!(std::io::Error, _e => Self::Io);

impl From<crate::plugins::PluginInstallError> for CoreError {
    fn from(error: crate::plugins::PluginInstallError) -> Self {
        use crate::plugins::PluginInstallErrorKind;
        let kind = match error.kind {
            PluginInstallErrorKind::InvalidInput => CoreErrorKind::InvalidInput,
            PluginInstallErrorKind::Network => CoreErrorKind::Network,
            PluginInstallErrorKind::RateLimited => CoreErrorKind::RateLimited,
            PluginInstallErrorKind::MissingRelease => CoreErrorKind::MissingRelease,
            PluginInstallErrorKind::Incompatible => CoreErrorKind::Incompatible,
            PluginInstallErrorKind::InvalidPackage => CoreErrorKind::InvalidPackage,
            PluginInstallErrorKind::Configuration => CoreErrorKind::Configuration,
            PluginInstallErrorKind::Io => CoreErrorKind::Io,
        };
        Self::new(kind, error.to_string())
    }
}

impl From<ConfigError> for CoreError {
    fn from(error: ConfigError) -> Self {
        let kind = match &error {
            ConfigError::Read { .. } | ConfigError::Write { .. } => CoreErrorKind::Io,
            ConfigError::PathResolution | ConfigError::Parse { .. } | ConfigError::Serialize(_) => {
                CoreErrorKind::Configuration
            }
        };
        // renCal's config errors already include their causes in Display.
        Self::new(kind, error.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classifies_nested_causes_without_losing_context() {
        let cases: Vec<(CoreError, CoreErrorKind, &str)> = vec![
            (
                CaldirError::Calendar(CalendarError::NotFound("/cal/work".into())).into(),
                CoreErrorKind::CalendarNotFound,
                "/cal/work",
            ),
            (
                ConnectionError::Calendar(CalendarError::Event(CalendarEventError::NotFound(
                    "missing.ics".into(),
                )))
                .into(),
                CoreErrorKind::EventNotFound,
                "missing.ics",
            ),
            (
                CalendarError::MasterNotFound("master".into()).into(),
                CoreErrorKind::EventNotFound,
                "master",
            ),
            (
                CaldirError::Calendar(CalendarError::AlreadyExists("work".into())).into(),
                CoreErrorKind::Conflict,
                "work",
            ),
            (
                CalendarError::State(CalendarStateError::InvalidEvent(EventError::MissingUid))
                    .into(),
                CoreErrorKind::InvalidInput,
                "UID",
            ),
            (
                CalendarEventError::InvalidEvent(
                    "bad.ics".into(),
                    EventError::Io("bad.ics".into(), std::io::Error::other("read failed")),
                )
                .into(),
                CoreErrorKind::Io,
                "read failed",
            ),
            (
                CaldirError::Config(CaldirConfigError::UnknownConfigDirectory).into(),
                CoreErrorKind::Configuration,
                "config directory",
            ),
            (
                CaldirConfigError::Write("config.toml".into(), std::io::Error::other("denied"))
                    .into(),
                CoreErrorKind::Io,
                "denied",
            ),
            (
                ConnectionError::Remote(RemoteError::Provider(ProviderError::Transport(
                    ProviderTransportError::Spawn(std::io::Error::from(
                        std::io::ErrorKind::NotFound,
                    )),
                )))
                .into(),
                CoreErrorKind::ProviderNotFound,
                "spawn provider",
            ),
            (
                ProviderError::Transport(ProviderTransportError::EmptyResponse).into(),
                CoreErrorKind::ProviderFailure,
                "no response",
            ),
            (
                ProviderError::Provider("authentication expired".into()).into(),
                CoreErrorKind::ProviderFailure,
                "authentication expired",
            ),
        ];
        for (error, kind, message) in cases {
            let error = error.context("Sync [work]");
            assert_eq!(error.kind, kind);
            assert!(error.message.starts_with("Sync [work]: "));
            assert!(error.message.contains(message), "{error}");
        }
    }

    #[test]
    fn provider_spawn_errors_preserve_identity_and_classify_io_causes() {
        for (cause, kind) in [
            (
                std::io::ErrorKind::NotFound,
                CoreErrorKind::ProviderNotFound,
            ),
            (std::io::ErrorKind::PermissionDenied, CoreErrorKind::Io),
        ] {
            let error = ConnectionError::Remote(RemoteError::UpdateEvent(
                "meeting".into(),
                ProviderError::TransportFor(
                    "google".into(),
                    ProviderTransportError::SpawnBinary(
                        "/bin/caldir-provider-google".into(),
                        std::io::Error::new(cause, "could not execute"),
                    ),
                ),
            ));
            let error = CoreError::from(error).context("[work]");
            assert_eq!(error.kind, kind);
            assert_eq!(
                error.message,
                "[work]: failed to update remote event meeting: provider google: failed to spawn provider executable /bin/caldir-provider-google: could not execute"
            );
        }
    }

    #[test]
    fn config_errors_are_classified_at_the_boundary() {
        let parse_error = toml::from_str::<rencal_config::RencalConfig>("theme = [")
            .err()
            .unwrap();
        let expected_message = format!("Could not parse config file config.toml: {parse_error}");
        let error = CoreError::from(ConfigError::Parse {
            path: "config.toml".into(),
            source: parse_error,
        });
        assert_eq!(error.kind, CoreErrorKind::Configuration);
        assert_eq!(error.message, expected_message);
        let error = CoreError::from(ConfigError::Write {
            path: "config.toml".into(),
            source: std::io::Error::other("permission denied"),
        });
        assert_eq!(error.kind, CoreErrorKind::Io);
        assert_eq!(
            error.message,
            "Could not write config at config.toml: permission denied"
        );
    }
}
