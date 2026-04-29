<p align="center">
<img width="735" height="482" alt="screenshot-wrapper" src="https://github.com/user-attachments/assets/63f6b188-8247-4e82-af63-bce74d0c8410" />
</p>

<h1 align="center">renCal</h1>

<p align="center">
  <b>Modern, open-source calendar app. Built for Omarchy.</b><br>
  Syncs with Google, iCloud, Outlook, and CalDAV.<br>
  Powered by <a href="https://caldir.org">Caldir</a>.
</p>

---

## Features

- **Local-first** — Your events are stored as plaintext `.ics` files. `grep` them, script
  them or hand them to Claude Code. No database, no lock-in.
- **Connect any provider** — Two-way sync with your existing Google, iCloud, Outlook or CalDAV account.
- **Natural-language input** — e.g. "lunch with Sarah tomorrow at 1pm".
- **Keyboard-driven** — Vim motions (`hjkl`) for navigation, `m`/`w` to switch views.
- **Themes** — Tokyo Night, Catppuccin Latte... It syncs with your Omarchy theme!

## Install

### Omarchy / Arch Linux (AUR)

```bash
yay -S rencal
```

<details>
<summary><b>Other platforms</b></summary>

### Linux (deb/rpm/AppImage)

Download from [Releases](https://github.com/t4t5/rencal/releases).

### macOS

Download the latest `.dmg` from [Releases](https://github.com/t4t5/rencal/releases), open it, and drag renCal to `/Applications`.

> Signed and notarized with Apple Developer ID - installs without Gatekeeper warnings.

</details>

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
# Start the Tauri app:
just dev
```
