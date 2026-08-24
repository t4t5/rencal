---
title: Developers
description: Build scripts and apps that work with renCal's calendar data
---

renCal stores its calendar data in the open [Caldir](https://caldir.org) format. You do not need to automate renCal's interface or use a renCal-specific API: scripts and apps can read the same local data directly.

## caldir-cli

For shell scripts and lightweight integrations, start with [`caldir-cli`](https://caldir.org/quickstart/). It can query and modify the calendars used by renCal, as well as trigger provider syncs.

```sh
caldir today
caldir events --from 2026-08-24 --to 2026-08-30
caldir new "Project review" --start 2026-08-26T14:00
caldir sync
```

Pass `--json` to receive machine-readable output instead of the human-friendly display:

```sh
caldir events --from 2026-08-24 --to 2026-08-30 --json
caldir calendars --json
```

This is how the [Omarchy Caldir Widget](https://github.com/t4t5/omarchy-caldir-widget) reads upcoming events. It is usually the simplest approach for widgets, status bars, launchers, and agent tools.

See the [caldir documentation](https://caldir.org/docs) for all available commands.

## caldir-core

Rust applications can integrate at a lower level with [`caldir-core`](https://crates.io/crates/caldir-core), the library renCal itself uses under the hood.

```sh
cargo add caldir-core
```

The crate provides typed access to caldir calendars and events without launching a subprocess. It is a better fit when you need tighter integration, want to work directly with calendar types, or are building a long-running Rust application.

See the [`caldir-core` API documentation](https://docs.rs/caldir-core) for the available types and methods.

## Open an event in renCal

Apps and websites can open a locally available event in renCal with an `rencal://` deep link. Pass the event's iCalendar `UID` as a URL-encoded query parameter:

```text
rencal://event?uid=team-sync%40example.com
```

For example, on a web page:

```html
<a href="rencal://event?uid=team-sync%40example.com">Open in renCal</a>
```

For one occurrence of a recurring event, also pass its URL-encoded recurrence ID:

```text
rencal://event?uid=team-sync%40example.com&recurrence-id=20260826T090000Z
```

Use a URL builder rather than concatenating values so that UIDs and recurrence IDs containing characters such as `@`, `/`, `+`, or `:` are encoded correctly:

```js
const url = new URL("rencal://event")
url.searchParams.set("uid", event.uid)

if (event.recurrenceId) {
  url.searchParams.set("recurrence-id", event.recurrenceId)
}

window.location.href = url.toString()
```

The event must already exist in the user's local caldir. renCal will open, navigate to the event, and show its details.
