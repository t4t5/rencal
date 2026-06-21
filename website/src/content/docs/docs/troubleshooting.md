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

## Events are not syncing

Sync issues are usually caused by provider authentication or network access.

Try these steps:

1. Check your internet connection.
2. Reconnect the calendar provider.
3. Check the error message by hovering over the warning icon. If it looks like a bug, [open an issue](https://github.com/t4t5/rencal/issues/new).

![Sync error](/docs/sync-error.png)

## Still stuck?

[Open an issue](https://github.com/t4t5/rencal/issues/new) on GitHub with:

- what you expected to happen,
- what happened instead,
- and any terminal output or screenshots that help explain the problem.

If a particular event is causing problems, you should attach the ICS file for it to make it easier to recreate the issue.
