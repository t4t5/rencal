//! Linux-only single-instance fallback.
//!
//! We avoid `tauri-plugin-single-instance` here because its Linux zbus path can
//! panic inside Tauri's tokio runtime. The first process owns a per-user Unix
//! socket; later launches send a bounded JSON message to it and exit. Debug and release use
//! separate sockets so `tauri dev` does not fight the installed app.

use serde::{Deserialize, Serialize};
use std::io::{Read, Write};
use std::os::unix::net::{UnixListener, UnixStream};
use std::path::PathBuf;

const MAX_MESSAGE_SIZE: usize = 64 * 1024;

#[derive(Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum InstanceMessage {
    Focus,
    OpenUrls { urls: Vec<String> },
}

/// Hold for the process lifetime; the kernel removes the socket file when the
/// listener is dropped (we also unbind explicitly on Drop for cleanliness).
pub struct InstanceGuard {
    listener: Option<UnixListener>,
    path: PathBuf,
}

impl Drop for InstanceGuard {
    fn drop(&mut self) {
        drop(self.listener.take());
        let _ = std::fs::remove_file(&self.path);
    }
}

impl InstanceGuard {
    /// Take the listener for the accept thread. The caller keeps the guard so
    /// the socket survives for the whole process (see [`spawn_listener`]).
    pub fn take_listener(&mut self) -> Option<UnixListener> {
        self.listener.take()
    }
}

fn socket_path() -> PathBuf {
    // Dev rencal (launched with "just dev") & prod rencal (installed with aur)
    // use different sockets so that both can run at the same time:
    let name = if cfg!(debug_assertions) {
        "rencal-dev"
    } else {
        "rencal"
    };

    if let Some(runtime) = dirs::runtime_dir() {
        // XDG_RUNTIME_DIR is already per-user (mode 0700, owned by the user),
        // so a bare filename is safe.
        return runtime.join(format!("{name}.sock"));
    }
    // Fallback: /tmp is shared across users. Namespace by euid so each user
    // gets their own socket instead of fighting over a single global one.
    let uid = unsafe { libc::geteuid() };
    std::env::temp_dir().join(format!("{name}-{uid}.sock"))
}

/// Either acquire the single-instance role (returning a guard + listener),
/// or signal the existing instance and return `None` so the caller can exit.
pub fn try_acquire_or_signal() -> Option<InstanceGuard> {
    let path = socket_path();

    // Existing instance? Forward deep-link arguments (if any), otherwise focus.
    if let Ok(mut stream) = UnixStream::connect(&path) {
        let urls: Vec<String> = std::env::args_os()
            .filter_map(|arg| arg.into_string().ok())
            .filter(|arg| arg.starts_with("rencal:"))
            .collect();
        let message = if urls.is_empty() {
            InstanceMessage::Focus
        } else {
            InstanceMessage::OpenUrls { urls }
        };
        if let Some(encoded) = encode_message(&message) {
            let _ = stream.write_all(&encoded);
        }
        return None;
    }

    // No live instance. Clear any stale file from a prior crash.
    let _ = std::fs::remove_file(&path);

    match UnixListener::bind(&path) {
        Ok(listener) => Some(InstanceGuard {
            listener: Some(listener),
            path,
        }),
        Err(e) => {
            // Race with another launch, or no permission to bind. We can't
            // own the role; treat ourselves as "first" anyway so the user
            // still gets a window — duplicates are recoverable, no-app isn't.
            log::warn!("could not bind single-instance socket: {e}");
            Some(InstanceGuard {
                listener: None,
                path,
            })
        }
    }
}

/// Spawn a thread that listens for framed messages. Valid URL messages are
/// passed to `on_message`; an empty vector represents a focus-only launch.
pub fn spawn_listener<F>(listener: UnixListener, on_message: F)
where
    F: Fn(Vec<String>) + Send + 'static,
{
    std::thread::spawn(move || {
        for incoming in listener.incoming() {
            let Ok(mut stream) = incoming else { continue };
            let mut bytes = Vec::new();
            if Read::by_ref(&mut stream)
                .take((MAX_MESSAGE_SIZE + 1) as u64)
                .read_to_end(&mut bytes)
                .is_err()
            {
                continue;
            }
            match decode_message(&bytes) {
                Some(InstanceMessage::Focus) => on_message(Vec::new()),
                Some(InstanceMessage::OpenUrls { urls }) => on_message(urls),
                None => log::warn!("ignoring invalid single-instance message"),
            }
        }
    });
}

fn encode_message(message: &InstanceMessage) -> Option<Vec<u8>> {
    let mut encoded = serde_json::to_vec(message).ok()?;
    encoded.push(b'\n');
    (encoded.len() <= MAX_MESSAGE_SIZE).then_some(encoded)
}

fn decode_message(bytes: &[u8]) -> Option<InstanceMessage> {
    if bytes.is_empty() || bytes.len() > MAX_MESSAGE_SIZE || bytes.last() != Some(&b'\n') {
        return None;
    }
    serde_json::from_slice(&bytes[..bytes.len() - 1]).ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn focus_and_open_urls_round_trip() {
        for message in [
            InstanceMessage::Focus,
            InstanceMessage::OpenUrls {
                urls: vec!["rencal://event?uid=a".into(), "rencal://event?uid=b".into()],
            },
        ] {
            let encoded = encode_message(&message).unwrap();
            assert_eq!(decode_message(&encoded), Some(message));
        }
    }

    #[test]
    fn invalid_and_oversized_messages_are_ignored() {
        assert_eq!(decode_message(b"not json\n"), None);
        assert_eq!(decode_message(b"{\"type\":\"focus\"}"), None);
        assert_eq!(decode_message(&vec![b'x'; MAX_MESSAGE_SIZE + 1]), None);
        assert_eq!(decode_message(b"{\"type\":\"unknown\"}\n"), None);
    }
}
