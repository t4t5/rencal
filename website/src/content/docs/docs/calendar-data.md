---
title: Calendar data
description: How renCal stores and syncs calendar data.
---

renCal uses [Caldir](https://caldir.org) to store your calendars as directories, with each event a a standard `.ics` file.

By default, the data is stored in `~/caldir/`. This path can be changed in renCal's settings, or by
editing `~/.config/caldir/config.toml` directly.

## Providers

renCal comes bundled with provider support for:

- Google Calendar
- iCloud Calendar
- Outlook Calendar
- CalDAV servers

More integrations can be added by anyone for their personal setup using the [provider protocol](https://caldir.org/providers/#provider-protocol). RenCal will by default pick up any
binary that starts with `caldir-provider-*` in your `$PATH`.
