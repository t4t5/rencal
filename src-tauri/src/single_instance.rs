//! Linux single-instance via Unix domain socket.
//!
//! `tauri-plugin-single-instance` uses `zbus::blocking` on Linux, which —
//! combined with the `zbus/tokio` feature pulled in transitively by
//! `tauri-plugin-dialog`'s `xdg-portal` feature — panics from a tokio context
//! ("Cannot start a runtime from within a runtime"). The plugin works fine on
//! macOS/Windows (no zbus there); we use this socket-based stand-in only on
//! Linux.
//!
//! Protocol: a single socket at `$XDG_RUNTIME_DIR/rencal.sock` (falling back
//! to `/tmp/...`). On startup, we try to connect:
//! - `Ok` → another instance is alive; we send `focus\n` and exit.
//! - `Err` → either no instance, or a stale socket file from a prior crash.
//!   Remove the file and bind. The bound listener is held for the process
//!   lifetime; a background thread accepts connections and forwards focus
//!   requests via the supplied callback.

use std::io::{Read, Write};
use std::os::unix::net::{UnixListener, UnixStream};
use std::path::PathBuf;

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

fn socket_path() -> PathBuf {
    dirs::runtime_dir()
        .unwrap_or_else(std::env::temp_dir)
        .join("rencal.sock")
}

/// Either acquire the single-instance role (returning a guard + listener),
/// or signal the existing instance and return `None` so the caller can exit.
pub fn try_acquire_or_signal() -> Option<InstanceGuard> {
    let path = socket_path();

    // Existing instance? Send focus and bail.
    if let Ok(mut stream) = UnixStream::connect(&path) {
        let _ = stream.write_all(b"focus\n");
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

/// Spawn a thread that listens for `focus\n` messages and invokes `on_focus`
/// for each. Consumes the listener out of the guard; the guard still holds
/// the path so cleanup on Drop still works.
pub fn spawn_listener<F>(guard: &mut InstanceGuard, on_focus: F)
where
    F: Fn() + Send + 'static,
{
    let Some(listener) = guard.listener.take() else {
        return;
    };
    std::thread::spawn(move || {
        for incoming in listener.incoming() {
            let Ok(mut stream) = incoming else { continue };
            let mut buf = String::new();
            let _ = stream.read_to_string(&mut buf);
            if buf.trim() == "focus" {
                on_focus();
            }
        }
    });
}
