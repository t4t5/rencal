---
title: Calendar data
description: How renCal stores and syncs calendar data.
---

renCal uses [Caldir](https://caldir.org) to store your calendars as directories, with each event a a standard `.ics` file.

By default, the data is stored in `~/caldir/`. This path can be changed in renCal's settings, or by
editing `~/.config/caldir/config.toml` directly.

## Providers

<img src="/docs/connect-calendar.png" alt="Connect calendar dialog" width="520" />

renCal comes bundled with support for:

- **Google Calendar**
- **iCloud Calendar**
- **Outlook Calendar**
- **other CalDAV servers**

More providers can be added using the [provider protocol](https://caldir.org/providers/#provider-protocol), for example:

- [Proton Calendar Provider](https://github.com/t4t5/caldir-provider-proton)
- [Tuta Calendar Provider](https://github.com/t4t5/caldir-provider-tuta)

RenCal will by default pick up any binary that starts with `caldir-provider-*` in your `$PATH`.
