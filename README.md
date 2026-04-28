<p align="center">
<img width="735" height="482" alt="screenshot-wrapper" src="https://github.com/user-attachments/assets/63f6b188-8247-4e82-af63-bce74d0c8410" />
</p>

<h1 align="center">RenCal</h1>

<p align="center">
  <b>Modern, open-source calendar app for Linux.</b><br>
  Connects to Google Calendar, iCloud, Outlook, CalDAV.<br>
  Built on top of <a href="https://caldir.org">Caldir</a> with Tauri.
</p>

---

## Install

### Arch Linux / Omarchy (AUR):

```bash
yay -S rencal
```

### Linux (deb/rpm/AppImage)

Download from [Releases](https://github.com/t4t5/rencal/releases).

### macOS

Download the latest `.dmg` from [Releases](https://github.com/t4t5/rencal/releases), open it, and drag RenCal to `/Applications`.

> Signed and notarized with Apple Developer ID - installs without Gatekeeper warnings.

## Screenshots

| Month view                                                                                     | Week view                                                                                     |
| ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| ![Month view](https://github.com/user-attachments/assets/72b2ba23-5503-4558-b018-0cb4ab97d0c9) | ![Week view](https://github.com/user-attachments/assets/9c209e19-53fd-440a-8278-13ca3ba13fc8) |

| Connect account                                                                                     | Theme selector                                                                                     |
| --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| ![Connect account](https://github.com/user-attachments/assets/24899b23-d64f-4395-96e7-ca4acc14a4e9) | ![Theme selector](https://github.com/user-attachments/assets/86f0460f-6e71-48f4-b78a-8cfad3b602ab) |

## Development

Use [`just`](https://just.systems/) to access handy development commands.

```bash
just dev
```
