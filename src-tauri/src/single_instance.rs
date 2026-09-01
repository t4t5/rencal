//! Linux-only single-instance fallback.
//!
//! We avoid `tauri-plugin-single-instance` here because its Linux zbus path can
//! panic inside Tauri's tokio runtime. The first process owns a per-user Unix
//! socket; later launches send deep-link URLs to it and exit. Debug and release
//! use separate sockets so `tauri dev` does not fight the installed app.
//!
//! Handshake (issue #114): a later launch writes its URLs, half-closes the
//! stream, and waits briefly for a one-byte ack. The primary acks only if its
//! binary is still on disk (a pacman upgrade unlinks it) and it still has a
//! main window to show. No ack means the primary is defunct — the new launch
//! terminates it and takes over the socket, instead of exiting 0 with no
//! window ever appearing.

use std::io::{Read, Write};
use std::net::Shutdown;
use std::os::unix::io::AsRawFd;
use std::os::unix::net::{UnixListener, UnixStream};
use std::path::PathBuf;
use std::time::Duration;

/// How long each side of the handshake waits on the other. A healthy primary
/// acks nearly instantly (it only checks its window registry), so this only
/// delays launches that are about to take over from a defunct primary.
const HANDSHAKE_TIMEOUT: Duration = Duration::from_secs(2);

const ACK: &[u8] = b"1";

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
        if signal_primary(&mut stream).is_ok() {
            return None;
        }
        // No ack: the primary is stale (binary replaced under it), hung, or
        // lost its window. Take over so this launch still produces a window.
        log::warn!("existing instance did not ack; taking over single-instance role");
        terminate_defunct_primary(&stream);
    }

    // No live instance. Clear any stale file from a prior crash or takeover.
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

/// Send our deep-link URLs (possibly none, meaning focus-only) to the primary
/// and wait for its ack. Any error means the primary can't be trusted with
/// this launch and the caller should take over.
fn signal_primary(stream: &mut UnixStream) -> std::io::Result<()> {
    let urls: Vec<String> = std::env::args_os()
        .filter_map(|arg| arg.into_string().ok())
        .filter(|arg| arg.starts_with("rencal:"))
        .collect();
    stream.write_all(urls.join("\n").as_bytes())?;
    // Half-close so the primary's read_to_string sees EOF while our read
    // side stays open for the ack.
    stream.shutdown(Shutdown::Write)?;
    stream.set_read_timeout(Some(HANDSHAKE_TIMEOUT))?;
    let mut ack = [0u8; 1];
    stream.read_exact(&mut ack)
}

/// Best-effort SIGTERM for a primary that failed the handshake, so takeovers
/// don't leave windowless background processes running (issue #114).
fn terminate_defunct_primary(stream: &UnixStream) {
    let mut cred = libc::ucred {
        pid: 0,
        uid: 0,
        gid: 0,
    };
    let mut len = std::mem::size_of::<libc::ucred>() as libc::socklen_t;
    let ret = unsafe {
        libc::getsockopt(
            stream.as_raw_fd(),
            libc::SOL_SOCKET,
            libc::SO_PEERCRED,
            (&mut cred as *mut libc::ucred).cast(),
            &mut len,
        )
    };
    if ret != 0 || cred.pid <= 0 {
        return;
    }
    // Guard against pid reuse: only kill a process that is still rencal.
    let comm = std::fs::read_to_string(format!("/proc/{}/comm", cred.pid)).unwrap_or_default();
    if comm.trim_end() != "rencal" {
        return;
    }
    log::warn!("terminating defunct primary instance (pid {})", cred.pid);
    let _ = unsafe { libc::kill(cred.pid, libc::SIGTERM) };
}

/// True once the binary this process was launched from has been replaced or
/// removed (e.g. by a pacman upgrade, which unlinks the old file and leaves
/// `/proc/self/exe` pointing at "... (deleted)").
fn exe_is_stale() -> bool {
    std::fs::read_link("/proc/self/exe")
        .map(|target| target.to_string_lossy().ends_with(" (deleted)"))
        .unwrap_or(false)
}

/// Spawn a thread that listens for newline-delimited URLs. An empty message
/// represents a focus-only launch. `on_message` returns whether the launch
/// was actually handled (a main window exists to show); only then do we ack —
/// otherwise the connecting process terminates us and takes over as primary.
pub fn spawn_listener<F>(listener: UnixListener, on_message: F)
where
    F: Fn(Vec<String>) -> bool + Send + 'static,
{
    std::thread::spawn(move || {
        for incoming in listener.incoming() {
            let Ok(mut stream) = incoming else { continue };
            let _ = stream.set_read_timeout(Some(HANDSHAKE_TIMEOUT));
            let mut message = String::new();
            if stream.read_to_string(&mut message).is_err() {
                continue;
            }
            if exe_is_stale() {
                log::warn!("binary replaced on disk; yielding single-instance role");
                continue;
            }
            if on_message(message.lines().map(String::from).collect()) {
                let _ = stream.write_all(ACK);
            }
        }
    });
}
