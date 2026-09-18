---
title: Troubleshooting
description: Common renCal problems and how to fix them.
---

This page covers common issues when installing, launching, or syncing renCal.

Start by [updating renCal](/docs/installation/#updating-rencal) and checking whether the problem still happens. You can find your version in **Settings → General → About**.

## renCal will not launch

Try launching renCal from a terminal to see any error output.

If you installed from the AUR, make sure your system packages are up to date:

```bash
yay -Syu
```

## Events are not syncing

Check your internet connection, then hover over the warning icon to read the sync error. Keep a copy of the message for a bug report.

![Sync error](/docs/sync-error.png)

### Get more details with caldir-cli

renCal uses [Caldir](https://caldir.org) to sync calendars. Its command-line tool can show more detailed errors, including which calendar or event is failing.

1. Install **caldir-cli** using the [Caldir quickstart](https://caldir.org/quickstart/). Follow only the installation steps: it uses your existing renCal calendar configuration, so you do not need to connect your accounts again.
2. Open a terminal and check your calendar data for issues, such as duplicate files:

   ```bash
   caldir doctor
   ```

3. Check for pending changes:

   ```bash
   caldir status
   ```

4. To retry the sync and see any errors, run:

   ```bash
   caldir sync
   ```

   This performs a real sync: it downloads remote changes and uploads pending local changes, including deletions.

Keep the command output, even if the sync succeeds; whether the problem also happens in caldir-cli helps narrow it down. Include the CLI version from `caldir --version` when reporting the results. See the [Caldir command reference](https://caldir.org/commands/) for more options.

If the error points to expired credentials or an authentication failure, reconnect the provider in renCal and retry.

## Still stuck?

Search the [existing issues](https://github.com/t4t5/rencal/issues) first. If the problem has not been reported, [open a bug report](https://github.com/t4t5/rencal/issues/new?template=bug_report.yml). The form asks for:

- your operating system and version, plus your desktop environment or window manager on Linux,
- how you installed renCal and which version you are running,
- steps to reproduce the problem, what you expected, and what happened instead,
- the calendar provider for sync or event problems,
- relevant error messages, terminal output, or screenshots, including caldir-cli results for sync problems.

For date or time problems, include your system timezone and the event's timezone. For recurring events, mention whether you edited one occurrence, future occurrences, or the entire series.

If a particular event triggers the problem, attach a copy of its `.ics` file from your [calendar directory](/docs/calendar-data/). A small example that reproduces the problem is especially useful.

GitHub issues are public. Remove passwords, tokens, private calendar URLs, and personal event details from logs, screenshots, and sample files before sharing them. Redact a copy of the ICS file, keeping the dates, timezones, and recurrence rules needed to reproduce the problem.
