//! Linux-only single-instance fallback.
//!
//! We avoid `tauri-plugin-single-instance` here because its Linux zbus path can
//! panic inside Tauri's tokio runtime. The first process owns a per-user Unix
//! socket; later launches send `focus\n` (or `open <path>\n` when launched
//! with an .ics file) to it and exit. Debug and release use separate sockets
//! so `tauri dev` does not fight the installed app.

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
/// `open_path` is an .ics file this launch was asked to open; it's forwarded
/// to the existing instance instead of a plain focus.
pub fn try_acquire_or_signal(open_path: Option<&str>) -> Option<InstanceGuard> {
    let path = socket_path();

    // Existing instance? Signal it and bail.
    if let Ok(mut stream) = UnixStream::connect(&path) {
        let msg = match open_path {
            Some(file) => format!("open {file}\n"),
            None => "focus\n".to_string(),
        };
        let _ = stream.write_all(msg.as_bytes());
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

/// Spawn a thread that listens for messages from later launches:
/// `focus\n` invokes `on_focus`, `open <path>\n` invokes `on_open`.
pub fn spawn_listener<F, G>(listener: UnixListener, on_focus: F, on_open: G)
where
    F: Fn() + Send + 'static,
    G: Fn(String) + Send + 'static,
{
    std::thread::spawn(move || {
        for incoming in listener.incoming() {
            let Ok(mut stream) = incoming else { continue };
            let mut buf = String::new();
            let _ = stream.read_to_string(&mut buf);
            let msg = buf.trim();
            if msg == "focus" {
                on_focus();
            } else if let Some(path) = msg.strip_prefix("open ") {
                on_open(path.to_string());
            }
        }
    });
}
