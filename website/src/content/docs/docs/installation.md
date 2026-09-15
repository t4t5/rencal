---
title: Installation
description: Install and update renCal on Linux and macOS.
---

Install renCal from the [download page](/download/).

## Nix

```sh
nix run github:t4t5/rencal
# or, in a NixOS config: inputs.rencal.packages.${system}.default
```

## Reminders support

On Linux, the AUR, `.deb`, and `.rpm` packages also install `rencal-notifierd`, a background service that can notify you when events are coming up.

If you're using the AppImage or are on macOS, you currently need to keep renCal running to receive reminder notifications.

## Updating renCal

- **AUR**: update with `yay -Syu`.
- **`.deb` / `.rpm` / AppImage**: install the latest package from the [download page](/download/) over the existing version.
- **macOS**: renCal prompts you in-app when a new version is available.
