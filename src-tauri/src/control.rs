//! `rencal do`: a control socket that runs app commands in the main window.
//!
//! A client writes one JSON [`CommandInvocation`] and half-closes. The running
//! app queues it in [`PendingCommands`] and emits `command-requested` as a
//! wake-up signal. The frontend owns the command registry: it drains the queue
//! through `commands.take_pending` (also on mount, so requests sent before the
//! window was listening still run), runs each command and reports its
//! [`CommandOutcome`] through `commands.respond`, which is written back to the
//! client.

use std::collections::{BTreeMap, HashMap, VecDeque};
use std::path::PathBuf;
use std::sync::Arc;
use std::sync::atomic::{AtomicU32, Ordering};
use std::time::Duration;

use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use specta::Type;
use tokio::sync::oneshot;

/// Commands may wait on the network (`app.sync`), so this is generous.
const RESPONSE_TIMEOUT: Duration = Duration::from_secs(30);
const READ_TIMEOUT: Duration = Duration::from_secs(2);
const MAX_REQUEST_BYTES: u64 = 64 * 1024;

#[derive(Clone, Debug, Default, PartialEq, Eq, Deserialize, Serialize, Type)]
pub struct CommandInvocation {
    /// A command id, optionally with its first argument: `date.next:day`.
    pub command: String,
    /// Fills the command's first argument.
    pub value: Option<String>,
    /// Arguments by name.
    pub args: BTreeMap<String, String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Deserialize, Serialize, Type)]
pub struct CommandRequest {
    pub id: u32,
    pub invocation: CommandInvocation,
}

#[derive(Clone, Debug, PartialEq, Eq, Deserialize, Serialize, Type)]
#[serde(tag = "status", rename_all = "kebab-case")]
pub enum CommandOutcome {
    /// `result` is JSON text, or `None` when the command returns nothing.
    Ok {
        result: Option<String>,
    },
    Error {
        message: String,
    },
}

impl CommandOutcome {
    fn error(message: impl Into<String>) -> Self {
        Self::Error {
            message: message.into(),
        }
    }
}

/// Requests not yet taken by the frontend, and requests waiting for its
/// outcome. Lives in `AppState`; drained and resolved through taurpc.
#[derive(Default)]
pub struct PendingCommands {
    next_id: AtomicU32,
    queued: Mutex<VecDeque<CommandRequest>>,
    waiting: Mutex<HashMap<u32, oneshot::Sender<CommandOutcome>>>,
}

impl PendingCommands {
    fn enqueue(&self, invocation: CommandInvocation) -> (u32, oneshot::Receiver<CommandOutcome>) {
        let id = self.next_id.fetch_add(1, Ordering::Relaxed);
        let (tx, rx) = oneshot::channel();
        self.waiting.lock().insert(id, tx);
        self.queued
            .lock()
            .push_back(CommandRequest { id, invocation });
        (id, rx)
    }

    fn forget(&self, id: u32) {
        self.queued.lock().retain(|request| request.id != id);
        self.waiting.lock().remove(&id);
    }

    /// Requests the frontend hasn't run yet, oldest first.
    pub fn take(&self) -> Vec<CommandRequest> {
        self.queued.lock().drain(..).collect()
    }

    /// Hands an outcome to its waiting request. Late outcomes (the request
    /// already timed out) are dropped.
    pub fn resolve(&self, id: u32, outcome: CommandOutcome) {
        if let Some(tx) = self.waiting.lock().remove(&id) {
            let _ = tx.send(outcome);
        }
    }

    /// Queue `invocation`, `wake` the frontend and wait for its outcome.
    async fn run(
        &self,
        invocation: CommandInvocation,
        wake: impl FnOnce() -> Result<(), String>,
    ) -> CommandOutcome {
        let (id, rx) = self.enqueue(invocation);
        if let Err(message) = wake() {
            self.forget(id);
            return CommandOutcome::error(message);
        }
        match tokio::time::timeout(RESPONSE_TIMEOUT, rx).await {
            Ok(Ok(outcome)) => outcome,
            Ok(Err(_)) => CommandOutcome::error("renCal dropped the command"),
            Err(_) => {
                self.forget(id);
                CommandOutcome::error("renCal didn't answer in time")
            }
        }
    }
}

/// A per-user socket path. Debug and release builds use separate names so
/// `just dev` and the installed app can run side by side.
pub(crate) fn runtime_socket_path(name: &str) -> PathBuf {
    let name = if cfg!(debug_assertions) {
        format!("{name}-dev")
    } else {
        name.to_string()
    };

    if let Some(runtime) = dirs::runtime_dir() {
        // XDG_RUNTIME_DIR is already per-user (mode 0700, owned by the user),
        // so a bare filename is safe.
        return runtime.join(format!("{name}.sock"));
    }
    // Fallback: /tmp is shared across users. Namespace by euid so each user
    // gets their own socket instead of fighting over a single global one.
    #[cfg(unix)]
    let uid = unsafe { libc::geteuid() };
    #[cfg(not(unix))]
    let uid = 0;
    std::env::temp_dir().join(format!("{name}-{uid}.sock"))
}

fn socket_path() -> PathBuf {
    runtime_socket_path("rencal-control")
}

/// Run `invocation` in the running app. `Err` means renCal couldn't be
/// reached; a command that ran and failed is `Ok(CommandOutcome::Error)`.
#[cfg(unix)]
pub fn send(invocation: &CommandInvocation) -> Result<CommandOutcome, String> {
    use std::io::{Read, Write};
    use std::net::Shutdown;
    use std::os::unix::net::UnixStream;

    let mut stream =
        UnixStream::connect(socket_path()).map_err(|_| "renCal isn't running".to_string())?;
    let request = serde_json::to_vec(invocation).map_err(|error| error.to_string())?;
    let io_error = |error: std::io::Error| format!("could not reach renCal: {error}");
    stream.write_all(&request).map_err(io_error)?;
    stream.shutdown(Shutdown::Write).map_err(io_error)?;
    // The server answers within its own timeout; this only guards a hang.
    stream
        .set_read_timeout(Some(RESPONSE_TIMEOUT + Duration::from_secs(5)))
        .map_err(io_error)?;
    let mut response = String::new();
    stream.read_to_string(&mut response).map_err(io_error)?;
    serde_json::from_str(&response).map_err(|_| "renCal sent an invalid response".to_string())
}

#[cfg(unix)]
pub async fn serve(app: tauri::AppHandle, state: Arc<crate::state::AppState>) {
    use std::os::unix::fs::PermissionsExt;
    use tokio::net::UnixListener;

    let path = socket_path();
    // Only the single primary instance gets here, so an existing file is
    // left over from a crash.
    let _ = std::fs::remove_file(&path);
    let listener = match UnixListener::bind(&path) {
        Ok(listener) => listener,
        Err(error) => {
            log::warn!("could not bind control socket {path:?}: {error}");
            return;
        }
    };
    // The /tmp fallback is shared; keep the socket to this user.
    let _ = std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600));

    loop {
        let Ok((stream, _)) = listener.accept().await else {
            continue;
        };
        let app = app.clone();
        let state = state.clone();
        tokio::spawn(async move {
            if let Err(error) = handle(stream, &app, &state).await {
                log::debug!("control socket client: {error}");
            }
        });
    }
}

#[cfg(unix)]
async fn handle(
    mut stream: tokio::net::UnixStream,
    app: &tauri::AppHandle,
    state: &crate::state::AppState,
) -> std::io::Result<()> {
    use tauri::Manager;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};

    let mut request = Vec::new();
    let mut limited = (&mut stream).take(MAX_REQUEST_BYTES);
    let read = limited.read_to_end(&mut request);
    let outcome = match tokio::time::timeout(READ_TIMEOUT, read).await {
        Err(_) => CommandOutcome::error("timed out reading the command"),
        Ok(Err(error)) => return Err(error),
        Ok(Ok(_)) => match serde_json::from_slice::<CommandInvocation>(&request) {
            Err(error) => CommandOutcome::error(format!("invalid command request: {error}")),
            Ok(invocation) => {
                state
                    .commands
                    .run(invocation, || {
                        if app.get_webview_window("main").is_none() {
                            return Err("renCal has no window open".into());
                        }
                        crate::events::AppEvent::CommandRequested(())
                            .emit(app)
                            .map_err(|error| error.to_string())
                    })
                    .await
            }
        },
    };
    let response = serde_json::to_vec(&outcome).map_err(std::io::Error::other)?;
    stream.write_all(&response).await?;
    stream.shutdown().await
}

#[cfg(test)]
mod tests {
    use super::*;

    fn invocation(command: &str) -> CommandInvocation {
        CommandInvocation {
            command: command.into(),
            ..Default::default()
        }
    }

    #[tokio::test]
    async fn waits_for_the_frontend_outcome() {
        let pending = Arc::new(PendingCommands::default());
        let resolver = pending.clone();
        let outcome = pending
            .run(invocation("date.today"), move || {
                let [request] = resolver.take().try_into().unwrap();
                assert_eq!(request.invocation.command, "date.today");
                resolver.resolve(
                    request.id,
                    CommandOutcome::Ok {
                        result: Some("\"2026-11-02\"".into()),
                    },
                );
                Ok(())
            })
            .await;
        assert_eq!(
            outcome,
            CommandOutcome::Ok {
                result: Some("\"2026-11-02\"".into())
            }
        );
        assert!(pending.waiting.lock().is_empty());
        assert!(pending.take().is_empty());
    }

    #[tokio::test]
    async fn a_failed_send_is_an_error_and_forgets_the_request() {
        let pending = PendingCommands::default();
        let outcome = pending
            .run(invocation("date.today"), || Err("no window".into()))
            .await;
        assert_eq!(outcome, CommandOutcome::error("no window"));
        assert!(pending.waiting.lock().is_empty());
        assert!(pending.take().is_empty());
    }

    #[test]
    fn late_outcomes_are_ignored() {
        PendingCommands::default().resolve(7, CommandOutcome::Ok { result: None });
    }

    #[test]
    fn outcomes_use_the_wire_format() {
        assert_eq!(
            serde_json::to_value(CommandOutcome::Ok { result: None }).unwrap(),
            serde_json::json!({ "status": "ok", "result": null })
        );
        assert_eq!(
            serde_json::to_value(CommandOutcome::error("nope")).unwrap(),
            serde_json::json!({ "status": "error", "message": "nope" })
        );
    }
}
