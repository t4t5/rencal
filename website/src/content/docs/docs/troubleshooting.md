---
title: Troubleshooting
description: Common renCal problems and how to fix them.
---

This page covers common issues when installing, launching, or syncing renCal.

## renCal will not launch

Try launching renCal from a terminal to see any error output.

If you installed from the AUR, make sure your system packages are up to date:

```bash
yay -Syu
```

## My calendars are missing

Check that the account is connected in settings.

If the account is connected but no calendars appear, try syncing again or reconnecting the provider.

## Events are not syncing

Sync issues are usually caused by provider authentication, network access, or remote calendar permissions.

Try these steps:

1. Check your internet connection.
2. Reconnect the calendar provider.
3. Confirm the calendar still exists in the remote service.
4. Make sure you have permission to edit the calendar if changes are not uploading.

## Natural language input parsed the wrong time

If an event is created with the wrong date or time, edit the event manually and try a more explicit phrase next time.

For example:

```txt
team sync tomorrow at 3pm
```

is usually clearer than:

```txt
team sync tomorrow afternoon
```

## Still stuck?

Open an issue on [GitHub](https://github.com/t4t5/rencal/issues) with:

- your operating system,
- how you installed renCal,
- what you expected to happen,
- what happened instead,
- and any terminal output or screenshots that help explain the problem.
