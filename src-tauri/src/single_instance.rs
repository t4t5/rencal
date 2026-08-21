//! Linux-only single-instance fallback.
//!
//! We avoid `tauri-plugin-single-instance` here because its Linux zbus path can
//! panic inside Tauri's tokio runtime. The first process owns a per-user Unix
//! socket; later launches send deep-link URLs to it and exit. Debug and release
//! use separate sockets so `tauri dev` does not fight the installed app.

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
        let _ = stream.write_all(urls.join("\n").as_bytes());
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

/// Spawn a thread that listens for newline-delimited URLs. An empty message
/// represents a focus-only launch.
pub fn spawn_listener<F>(listener: UnixListener, on_message: F)
where
    F: Fn(Vec<String>) + Send + 'static,
{
    std::thread::spawn(move || {
        for incoming in listener.incoming() {
            let Ok(mut stream) = incoming else { continue };
            let mut message = String::new();
            if stream.read_to_string(&mut message).is_err() {
                continue;
            }
            on_message(message.lines().map(String::from).collect());
        }
    });
}
