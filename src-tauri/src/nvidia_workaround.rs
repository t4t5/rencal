//! Workaround for WebKitGTK's DMA-BUF renderer failing on Nvidia GPUs.
//!
//! When the proprietary Nvidia driver backs the session, WebKit's DMA-BUF
//! renderer can fail to allocate GBM buffers, crashing the app or leaving the
//! window blank (issue #45). Setting WEBKIT_DISABLE_DMABUF_RENDERER=1 avoids
//! that. But on hybrid laptops the compositor runs on the integrated GPU,
//! where the DMA-BUF renderer works fine — disabling it there forces WebKit
//! onto a slow shared-memory path and makes the whole UI laggy (issue #102).
//!
//! WebKit picks its render device from the session's EGL display (the GPU the
//! compositor runs on), so we only disable the renderer when that GPU is the
//! Nvidia one — not merely because the Nvidia driver is loaded.

use std::path::{Path, PathBuf};

/// Mesa-backed GPU drivers whose DMA-BUF path is known-good. When one of
/// these is present alongside Nvidia (hybrid graphics), the compositor runs
/// on it by default and the workaround must not fire.
const MESA_GPU_DRIVERS: [&str; 4] = ["i915", "xe", "amdgpu", "radeon"];

/// Disables WebKit's DMA-BUF renderer, but only on sessions where the Nvidia
/// GPU actually backs rendering. Must run before GTK/WebKit initialize.
pub fn apply_if_needed() {
    // Respect an explicit user setting; WebKit treats "0" as "keep enabled"
    // (see AcceleratedBackingStore.cpp), so this doubles as an escape hatch.
    if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_some() {
        return;
    }

    // Proprietary Nvidia driver not loaded — nothing to work around.
    if !Path::new("/proc/driver/nvidia/version").exists() {
        return;
    }

    if !nvidia_backs_session() {
        eprintln!(
            "rencal: Nvidia driver present but another GPU backs the session; keeping WebKit's DMA-BUF renderer"
        );
        return;
    }

    eprintln!("rencal: Nvidia GPU backs the session; disabling WebKit's DMA-BUF renderer");
    // SAFETY: called at the top of run(), before GTK/WebKit initialize;
    // nothing else reads this variable at this point.
    unsafe {
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    }
}

/// Whether the Nvidia GPU is the one the compositor — and therefore WebKit's
/// EGL display — renders on, rather than just being present in the machine.
fn nvidia_backs_session() -> bool {
    // An explicit compositor device list wins (Hyprland/aquamarine and
    // wlroots); its first entry is the primary GPU.
    for var in ["AQ_DRM_DEVICES", "WLR_DRM_DEVICES"] {
        if let Some(devices) = std::env::var_os(var) {
            let devices = devices.to_string_lossy();
            if let Some(primary) = devices.split(':').find(|entry| !entry.is_empty()) {
                return device_driver(Path::new(primary)).as_deref() == Some("nvidia");
            }
        }
    }

    let mut has_mesa_gpu = false;
    let mut nvidia_is_boot_vga = false;

    for card in drm_cards() {
        let Some(driver) = card_driver(&card) else {
            continue;
        };
        if driver == "nvidia" {
            if is_boot_vga(&card) {
                nvidia_is_boot_vga = true;
            }
        } else if MESA_GPU_DRIVERS.contains(&driver.as_str()) {
            has_mesa_gpu = true;
        }
    }

    // Nvidia-only system (issue #45), or a hybrid one where Nvidia is the
    // boot GPU — the one compositors pick as primary by default. A Mesa GPU
    // holding boot_vga means the session's EGL device is the Mesa GPU and
    // DMA-BUF works fine (issue #102).
    !has_mesa_gpu || nvidia_is_boot_vga
}

/// The GPU entries in /sys/class/drm ("card0", "card1", ...), skipping
/// connector entries like "card0-HDMI-A-1".
fn drm_cards() -> Vec<PathBuf> {
    let Ok(entries) = std::fs::read_dir("/sys/class/drm") else {
        return Vec::new();
    };
    entries
        .flatten()
        .filter(|entry| {
            entry
                .file_name()
                .to_str()
                .and_then(|name| name.strip_prefix("card"))
                .is_some_and(|rest| !rest.is_empty() && rest.bytes().all(|b| b.is_ascii_digit()))
        })
        .map(|entry| entry.path())
        .collect()
}

/// Kernel driver name for a /sys/class/drm card entry, e.g. "nvidia" or "i915".
fn card_driver(card: &Path) -> Option<String> {
    let target = std::fs::read_link(card.join("device/driver")).ok()?;
    Some(target.file_name()?.to_string_lossy().into_owned())
}

/// Whether this card is the GPU the firmware booted with — the one
/// compositors pick as their primary render device by default.
fn is_boot_vga(card: &Path) -> bool {
    std::fs::read_to_string(card.join("device/boot_vga")).is_ok_and(|value| value.trim() == "1")
}

/// Kernel driver for a DRM device path like /dev/dri/card1, resolving
/// by-path symlinks as used in AQ_DRM_DEVICES.
fn device_driver(device: &Path) -> Option<String> {
    let resolved = std::fs::canonicalize(device).ok()?;
    let name = resolved.file_name()?;
    card_driver(&Path::new("/sys/class/drm").join(name))
}
