---
title: Installation
description: Install and update renCal on Linux and macOS.
---

Download the latest release from the [renCal download page](/download).

## Linux

### Arch Linux and Omarchy

Install the AUR package:

```bash
yay -S rencal-bin
```

### Debian, Ubuntu, Fedora, and other distributions

The download page provides x64 `.deb`, `.rpm`, and AppImage builds.

- Use `.deb` on Debian and Ubuntu-based distributions.
- Use `.rpm` on Fedora and other RPM-based distributions.
- Use the AppImage when you do not want to install a system package.

The AUR, `.deb`, and `.rpm` packages include the background reminder service. AppImage reminders require renCal to remain running.

## macOS

Download the Apple Silicon `.dmg`, open it, and drag renCal into **Applications**.

The app is signed and notarized. On first use, macOS may ask for permission to show notifications.

## Update renCal

- **AUR:** update with your normal system upgrade, such as `yay -Syu`.
- **`.deb`, `.rpm`, and AppImage:** download the newest package and install or replace the existing version.
- **macOS:** renCal checks for signed updates and offers to install them in the app.

Your calendar data and preferences are kept separately from the application, so updating renCal does not replace them.

Once installed, follow the [Quick start](/docs/quick-start/) guide.
