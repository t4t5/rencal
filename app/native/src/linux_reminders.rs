//! Linux reminder host policy.
//!
//! Linux package installs ship `rencal-notifierd` as a systemd user service so
//! reminders can fire when the GUI is closed. This module owns the systemd
//! checks needed by the GUI: enable the daemon when a packaged unit is visible,
//! and decide whether the GUI should run the in-process fallback loop.

const NOTIFIERD_SERVICE: &str = "rencal-notifierd.service";

/// Package installs (deb/rpm/AUR) drop the daemon's unit file at
/// `/usr/lib/systemd/user/rencal-notifierd.service` but each user still has to
/// enable it once. Detect that state on launch and enable+start automatically.
///
/// Skipped if the unit isn't visible to systemctl at all (dev builds, manual
/// AppImage runs, or non-systemd systems): users in those flows install via
/// `just install-notifierd` or accept the in-process fallback.
pub fn enable_notifierd_if_needed() {
    let status = std::process::Command::new("systemctl")
        .args(["--user", "is-enabled", "--quiet", NOTIFIERD_SERVICE])
        .status();
    match status {
        Ok(s) if s.success() => return,
        Ok(_) => {}
        Err(_) => return,
    }

    if !notifierd_unit_exists() {
        return;
    }

    log::info!("Enabling {NOTIFIERD_SERVICE} for the current user");
    let _ = std::process::Command::new("systemctl")
        .args(["--user", "enable", "--now", NOTIFIERD_SERVICE])
        .status();
}

/// Package upgrades replace the daemon's binary but leave the old process
/// running, and it may fail to parse the new app's config on every tick. Newer
/// daemons restart themselves; this catches ones that predate that.
pub fn restart_notifierd_if_upgraded() {
    let Some(pid) = notifierd_main_pid() else {
        return;
    };
    let proc_exe = std::path::PathBuf::from(format!("/proc/{pid}/exe"));
    if !reminder_core::binary_was_upgraded(&proc_exe) {
        return;
    }

    log::info!("Restarting {NOTIFIERD_SERVICE}: its binary was upgraded");
    let _ = std::process::Command::new("systemctl")
        .args(["--user", "try-restart", NOTIFIERD_SERVICE])
        .status();
}

/// Return true when the GUI should run the fallback reminder loop.
///
/// If the systemd daemon is active, it is the single reminder source and the
/// GUI must stay quiet to avoid duplicate notifications.
pub fn should_run_in_process_reminders() -> bool {
    !is_notifierd_active()
}

fn is_notifierd_active() -> bool {
    std::process::Command::new("systemctl")
        .args(["--user", "is-active", "--quiet", NOTIFIERD_SERVICE])
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

/// systemd reports 0 when the unit isn't running.
fn notifierd_main_pid() -> Option<u32> {
    let output = std::process::Command::new("systemctl")
        .args([
            "--user",
            "show",
            "-p",
            "MainPID",
            "--value",
            NOTIFIERD_SERVICE,
        ])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let pid: u32 = String::from_utf8_lossy(&output.stdout)
        .trim()
        .parse()
        .ok()?;
    (pid != 0).then_some(pid)
}

fn notifierd_unit_exists() -> bool {
    // Distinguish "disabled" from "doesn't exist". list-unit-files returns 0
    // and prints rows when the unit is known to systemd.
    std::process::Command::new("systemctl")
        .args([
            "--user",
            "list-unit-files",
            NOTIFIERD_SERVICE,
            "--no-legend",
        ])
        .output()
        .map(|o| o.status.success() && !o.stdout.is_empty())
        .unwrap_or(false)
}
