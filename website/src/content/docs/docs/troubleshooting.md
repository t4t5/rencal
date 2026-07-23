---
title: Troubleshooting
description: Diagnose common installation, connection, sync, reminder, and theme problems.
---

## renCal will not launch

Launch renCal from a terminal to see its error output.

If you installed from the AUR, first make sure your system packages are current:

```bash
yay -Syu
```

If an AppImage will not start, make sure it is executable and that your distribution supports AppImages.

## An account will not connect

Open **Settings → Accounts** and check the status beside the account. If it reports a failure, open its menu and select **Reconnect…**.

Also check:

1. Your internet connection.
2. Whether the provider needs an app-specific password.
3. Whether a third-party `caldir-provider-*` executable is installed and available in your `$PATH`.

## Events are missing

Check that:

- the correct calendar group is selected in the main toolbar;
- the calendar is enabled in **Settings → Calendars** for that group;
- renCal is using the expected directory under **Settings → General → Data directory**;
- the cloud icon does not report a sync error.

Public subscriptions and provider calendars may also take a moment to populate during their first sync.

## Events are not syncing

Hover over the cloud icon for the current status and error message. Select it to retry immediately.

![A sync error displayed from the cloud status icon](/docs/sync-error.png)

If automatic sync is disabled under **Settings → General**, pending pushes and pulls remain local until you select the cloud icon.

Try:

1. Check your internet connection.
2. Reconnect the affected account.
3. Retry the sync.
4. If the message looks like a renCal bug, include it in a GitHub issue.

## A large deletion warning appeared

renCal pauses before pushing ten or more event deletions from a calendar.

- Choose **Delete events** only if the local deletions are intentional.
- Choose **Restore events** to discard those local deletion changes and recover the remote events.
- Choose **Cancel** if you need to inspect the calendar first.

## Reminders are not appearing

Confirm that notifications are enabled under **Settings → Reminders** and that the event has at least one reminder.

On Linux package installs, inspect the background service:

```bash
systemctl --user status rencal-notifierd.service
```

Its recent logs are available with:

```bash
journalctl --user -u rencal-notifierd.service
```

AppImage installations and systems without the service require renCal to remain running. The same applies on macOS.

## A custom theme does not appear

Custom themes must:

- be `.css` files directly inside `~/.config/rencal/themes/`;
- contain bare CSS declarations rather than a wrapping selector;
- have a filename containing at least one letter or number.

Saved changes normally appear automatically. Check the CSS for syntax errors if the theme is listed but does not look correct.

## Still stuck?

[Open an issue](https://github.com/t4t5/rencal/issues/new) with:

- what you expected to happen;
- what happened instead;
- the renCal version and installation type;
- relevant terminal output, provider errors, or screenshots.

If a particular event causes the problem, an `.ics` file can help reproduce it. Remove private names, email addresses, locations, notes, and meeting links before attaching it publicly.
