# renCal

<p align="center">
  <img src="website/public/app-icon.png" alt="renCal" width="100" />
</p>

<p align="center">
  <a href="https://rencal.org">rencal.org</a> · <a href="#install">install</a> · <a href="https://rencal.org/docs/installation/">docs</a>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-666666?labelColor=333333" alt="MIT license" /></a>
  <a href="https://github.com/t4t5/rencal/releases/latest"><img src="https://img.shields.io/github/v/release/t4t5/rencal?label=release&labelColor=333333&color=666666" alt="latest release" /></a>
  <a href="https://aur.archlinux.org/packages/rencal-bin"><img src="https://img.shields.io/aur/version/rencal-bin?label=aur&labelColor=333333&color=666666" alt="AUR version" /></a>
</p>

---

https://github.com/user-attachments/assets/cb64fe4e-c546-4f7b-b1c3-51692850847f

<p align="center">
  <b>Modern, open-source calendar app. Built for Omarchy.</b><br>
  Syncs with Google, iCloud, Outlook, and CalDAV using <a href="https://caldir.org">Caldir</a>.
</p>

## Features

- **Local-first** — Your events are stored as plaintext `.ics` files. Human-readable and agent-friendly.
- **Connect any provider** — Works with your existing Google, iCloud, Outlook or CalDAV account.
- **Natural-language input** — e.g. "lunch with Sarah tomorrow at 1pm".
- **Keyboard-driven** — Vim motions (`hjkl`) for navigation. See all shortcuts with <kbd>?</kbd>.
- **Themes** — Tokyo Night, Catppuccin Latte... It syncs with your Omarchy theme!

## Install

### Omarchy / Arch Linux (AUR)

```bash
yay -S rencal-bin
```

### Linux (deb/rpm/AppImage)

Download from the [Download page](https://rencal.org/download/).

### macOS

Download the latest `.dmg` from the [Download page](https://rencal.org/download/), open it, and drag renCal to `/Applications`.

### NixOS

```bash
nix profile install github:t4t5/rencal/v0.x.y
```

## Docs

See the [renCal documentation](https://rencal.org/docs/installation/).

## Screenshots

| Month view                                                                                     | Week view                                                                                     |
| ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| ![Month view](https://github.com/user-attachments/assets/72b2ba23-5503-4558-b018-0cb4ab97d0c9) | ![Week view](https://github.com/user-attachments/assets/9c209e19-53fd-440a-8278-13ca3ba13fc8) |

| Theme: Gruvbox                                                                              | Theme: Catpuccin Light                                                                              | Theme: Hackerman                                                                              |
| ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| ![Gruvbox](https://github.com/user-attachments/assets/f1e4560c-1680-4800-90e2-b68f001bd5ed) | ![Catpuccin Light](https://github.com/user-attachments/assets/6e25d158-10d1-46f9-9355-2bc5ec20d398) | ![Hackerman](https://github.com/user-attachments/assets/cdda52df-8e8c-46c8-b601-6eef66abce2b) |

| Connect account                                                                                     | Theme selector                                                                                     |
| --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| ![Connect account](https://github.com/user-attachments/assets/24899b23-d64f-4395-96e7-ca4acc14a4e9) | ![Theme selector](https://github.com/user-attachments/assets/86f0460f-6e71-48f4-b78a-8cfad3b602ab) |

## Development

Use [`just`](https://just.systems/) to access handy development commands.

```bash
just dev
```

The first run downloads the caldir provider binaries for your platform.
Later runs reuse the binaries in `src-tauri/providers/`.
