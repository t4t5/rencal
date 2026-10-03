---
title: Calendar data
description: How renCal stores and syncs calendar data.
---

renCal uses [Caldir](https://caldir.org) to store your calendars as directories, with each event a standard `.ics` file.

By default, the data is stored in `~/caldir/`. This path can be changed in renCal's settings, or by
editing `~/.config/caldir/config.toml` directly.

## Providers

<img src="/docs/connect-calendar.png" alt="Connect calendar dialog" width="520" />

renCal comes bundled with support for:

- **Google Calendar**
- **iCloud Calendar**
- **Outlook Calendar**
- **other CalDAV servers**

You can install more providers from the [plugin directory](/plugins/).

renCal also picks up any `caldir-provider-*` binary in your `$PATH`. To build your own, see [Provider plugins](/docs/plugins/providers/).
