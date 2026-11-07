//! Annotate mode's notes, for development. `RENCAL_ANNOTATE` names the folder
//! they go in; `1` means the repo's `.agents/feedback`.

use std::path::{Path, PathBuf};

use serde_json::Value;
use tokio::process::Command;

/// Whether annotate mode is on: `RENCAL_ANNOTATE` is set.
pub fn enabled() -> bool {
    dir().is_some()
}

fn dir() -> Option<PathBuf> {
    let value = std::env::var("RENCAL_ANNOTATE")
        .ok()
        .filter(|value| !value.is_empty())?;
    if matches!(value.as_str(), "1" | "true") {
        return Some(Path::new(env!("CARGO_MANIFEST_DIR")).join("../../.agents/feedback"));
    }
    Some(PathBuf::from(value))
}

/// Writes `notes` as `<time>.md`, after a screenshot of the window as
/// `<time>.png`; returns the notes' path.
pub async fn save(notes: String) -> Result<String, String> {
    let dir = dir().ok_or("RENCAL_ANNOTATE isn't set")?;
    tokio::fs::create_dir_all(&dir)
        .await
        .map_err(|error| format!("{}: {error}", dir.display()))?;
    let dir = dir.canonicalize().unwrap_or(dir);

    let stamp = chrono::Local::now().format("%Y-%m-%d-%H%M%S").to_string();
    let shot = format!("{stamp}.png");
    let header = match screenshot(&dir.join(&shot)).await {
        Ok(()) => format!("![The window, with numbered pins]({shot})"),
        Err(error) => format!("No screenshot: {error}"),
    };
    let path = dir.join(format!("{stamp}.md"));
    tokio::fs::write(
        &path,
        format!("# renCal feedback, {stamp}\n\n{header}\n\n{notes}"),
    )
    .await
    .map_err(|error| format!("{}: {error}", path.display()))?;
    Ok(path.to_string_lossy().into_owned())
}

/// This process's most recently focused window, through Hyprland and grim.
async fn screenshot(out: &Path) -> Result<(), String> {
    let clients = Command::new("hyprctl")
        .args(["clients", "-j"])
        .output()
        .await
        .map_err(|error| format!("needs Hyprland's hyprctl ({error})"))?;
    if !clients.status.success() {
        let said = if clients.stderr.is_empty() {
            &clients.stdout
        } else {
            &clients.stderr
        };
        return Err(format!("hyprctl: {}", String::from_utf8_lossy(said).trim()));
    }
    let clients: Vec<Value> = serde_json::from_slice(&clients.stdout)
        .map_err(|_| "hyprctl isn't talking to a running Hyprland")?;
    let window = clients
        .iter()
        .filter(|client| client["pid"].as_u64() == Some(u64::from(std::process::id())))
        .min_by_key(|client| client["focusHistoryID"].as_i64().unwrap_or(i64::MAX))
        .ok_or("no window of this process in `hyprctl clients`")?;
    let (at, size) = (&window["at"], &window["size"]);
    let geometry = format!("{},{} {}x{}", at[0], at[1], size[0], size[1]);
    let status = Command::new("grim")
        .args(["-g", &geometry])
        .arg(out)
        .status()
        .await
        .map_err(|error| format!("needs grim ({error})"))?;
    if status.success() {
        Ok(())
    } else {
        Err(format!("grim exited with {status}"))
    }
}
