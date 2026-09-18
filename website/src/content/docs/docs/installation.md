---
title: Installation
description: Install and update renCal on Linux and macOS.
---

renCal ships packages for Linux and macOS. Pick your platform below, or grab a build from the [download page](/download/).

## Omarchy / Arch Linux (AUR)

```sh
yay -S rencal-bin
```

Update with `yay -Syu`.

## Linux (deb / rpm / AppImage)

Download the latest `.deb`, `.rpm` or AppImage from the [download page](/download/). To update, install the new package over the existing version.

## macOS

Download the latest `.dmg` from the [download page](/download/), open it, and drag renCal to `/Applications`. renCal prompts you in-app when a new version is available.

## NixOS

```sh
nix profile install github:t4t5/rencal/v0.x.y
```

Replace `v0.x.y` with the [latest release tag](https://github.com/t4t5/rencal/releases/latest). You can also `nix run` or `nix build` the same flake. Omit the tag to track `main`.

## Reminders support

On Linux, the AUR, `.deb` and `.rpm` packages also install `rencal-notifierd`, a background service that notifies you when events are coming up.

With the AppImage or on macOS, keep renCal running to receive reminder notifications.
