---
name: screenshots
description: Capture polished screenshots of renCal with realistic mock data, for app directories, the website, docs or release notes. Use when the user asks for screenshots, marketing images or store/listing images of renCal, or wants to drive the running app by keyboard and mouse on Hyprland.
---

# Screenshots

Runs a dev build against an isolated config and a generated mock caldir, then drives it with `wtype`/`ydotool` and captures windows with `grim`. Requires Hyprland (Lua dispatch syntax, as on current Omarchy), `grim`, `wtype`, `ydotool`, `jq` and the `caldir` CLI.

Everything goes through `scripts/shots.sh` (run it with no arguments for usage). State lives in `$RENCAL_SHOTS_DIR` (default `$XDG_RUNTIME_DIR/rencal-shots`); point it at your scratchpad if you have one. The user's real caldir, renCal config and notifications are never touched.

## Workflow

1. `shots.sh setup [YYYY-MM-DD]` writes the isolated config and ~50 events around that week (default: this week) in five calendars: recurring meetings, all-day and multi-day events, attendees, locations, descriptions, Google Meet links. Edit `scripts/mock-caldir.py` to change the data; rerunning `setup` regenerates it and the running app picks it up live.
2. `shots.sh start` with the shell tool's background mode. The first run compiles for a few minutes.
3. `shots.sh ready [WxH]` waits for the window, floats it at 1400x875 logical (16:10; 2800x1750 on a 2x display), centers it, forces it opaque and starts `ydotool` if needed. Tell the user a window will appear and their cursor will move while you work.
4. Set up each scene, capture it with `shots.sh shot <name>`, and **look at every capture** before moving on.
5. Copy the keepers somewhere the user can reach (e.g. `~/Pictures/rencal-<purpose>/`, numbered in the order they should be shown) and check sizes against any limit they gave.
6. `shots.sh cleanup` quits the dev app and stops `ydotool` if `ready` started it.

## Scenes

| Scene                      | How                                                                                                                                                                                                                                                            |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Week / month / year        | `key w`, `key m`, `key y`                                                                                                                                                                                                                                      |
| Event details popover      | `click <x> <y>` on an event (Tab does not open it)                                                                                                                                                                                                             |
| Search                     | `key /` then `key lunch`                                                                                                                                                                                                                                       |
| Command palette            | `combo ctrl+k`                                                                                                                                                                                                                                                 |
| Theme                      | `theme "ren light"` (palette: "theme" → Enter → name → Enter); Ren, Ren Light, Catpuccin Latte, Tokyo Night, Classic, Nord, Electric Blue, Minimal Light plus installed plugin themes                                                                          |
| Settings                   | `combo ctrl+comma` opens a separate window titled `Settings`; switch tabs with `click <x> <y> Settings` and capture with `shot <name> Settings`. Sidebar items sit at x≈60, y≈30/70/110/150/190/230 (General, Accounts, Calendars, Reminders, Themes, Plugins) |
| Connect calendar dialog    | Settings → Accounts → `click 320 77 Settings`                                                                                                                                                                                                                  |
| Close popovers and dialogs | `key -k Escape`                                                                                                                                                                                                                                                |

Good default set: month, week, event details, year, search, a light theme, another dark theme, a plugin theme, Settings → Themes, the connect dialog, Settings → Plugins.

## Gotchas

- **Coordinates**: `click` takes window-relative _logical_ pixels. Captures are at the monitor scale, so divide image pixels by the scale (`hyprctl monitors -j | jq '.[].scale'`).
- **Modifiers**: `wtype -M ctrl …` never reaches the WebKitGTK window, so modifier shortcuts go through `combo` (ydotool). Plain keys and text work with `key` (wtype).
- **Focus and dimming**: focus follows the mouse and unfocused windows are dimmed. The script parks the cursor inside the target window; a capture that looks washed out means focus moved to another window.
- **Opacity**: Omarchy makes every window slightly translucent and text from behind bleeds into captures. `ready` and `shot` force opacity to 1.
- **Theme via config**: editing `config.toml` while the app runs did not switch the theme; use `theme`.
- **Settings window** is fixed at 852x552 (`resizable: false`), so the bottom row of theme tiles is cut off.
- **Times**: events use `TZID=<system zone>` local times. With UTC times, recurring events move an hour across a DST change. The current-time line is real, so capture during the day if it should land among the events.
- **Hyprland syntax**: dispatchers are Lua (`hl.dsp.window.float({ ... })`); the legacy `hyprctl dispatch setfloating …` form errors.
