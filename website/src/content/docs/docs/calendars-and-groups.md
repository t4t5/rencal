---
title: Calendars and groups
description: Organise calendars, subscriptions, visibility, and calendar groups.
---

Open **Settings → Calendars** to control which calendars appear in renCal and how they are organised.

## Manage a calendar

Use the menu beside a calendar to:

- set it as the default for new events;
- rename it locally;
- change its display colour;
- disconnect or delete it.

Only writable calendars are available when creating or moving an event.

> **Be careful when removing calendars**
>
> **Delete calendar** permanently deletes a local-only calendar and all of its event files. **Disconnect calendar** removes a connected calendar's directory from this computer, but does not delete the remote calendar.

## Local-only calendars

When no calendars are configured, the connection dialog offers **Local-only calendar**. Its events remain on your computer and are never sent to a provider.

Local and connected calendars use the same standard `.ics` event files, so they can be backed up or used with other Caldir tools.

## Public calendar subscriptions

Select **Add subscription** and paste a public `webcal`, `http`, or `https` `.ics` feed URL.

Subscriptions are intended for calendars such as public holidays or event schedules. They are read-only in renCal, so subscribed events cannot be edited or used as the destination for a new event.

## Calendar visibility

The checkbox beside each calendar controls whether it is included in the selected group. Hidden calendars stay on disk and continue to belong to their provider; they are only filtered out of the calendar views.

## Calendar groups

Groups are saved sets of visible calendars. They are useful for switching between contexts such as Work and Personal without connecting and disconnecting accounts.

To create a group:

1. Select the **+** beside **Groups**.
2. Give the group a unique name.
3. Select which calendars it should show.

Switch groups from the main toolbar or press <kbd>G</kbd>. The **Default** group is always available and cannot be renamed or deleted.

## Calendar data location

Calendar directories are stored under `~/caldir/` by default. Change the location under **Settings → General → Data directory**.

Caldir's own configuration is stored in `~/.config/caldir/config.toml`; renCal preferences such as groups and theme are stored separately in `~/.config/rencal/config.toml`.
