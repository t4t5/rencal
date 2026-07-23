---
title: Reminders and notifications
description: Configure event reminders and desktop notifications in renCal.
---

renCal reads standard calendar alarms from your `.ics` events and delivers them as desktop notifications.

## Add reminders to an event

Open an event and select **Reminders**. The built-in choices include the event time, 10 minutes, 30 minutes, and one hour before the event.

You can type another duration using minutes, hours, days, weeks, or months—for example `45 minutes`, `2 hours`, or `1 week`. An event can have more than one reminder.

Read-only calendar events cannot have their reminders changed.

## Set default reminders

Open **Settings → Reminders** to:

- enable or disable notifications globally;
- add reminders that should be applied to every new event.

Changing the defaults does not modify existing events.

## Background notification support

| Installation                                     | When reminders can fire                                                                          |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| AUR, `.deb`, or `.rpm` on Linux with systemd     | A bundled `rencal-notifierd` service runs in the background after renCal has been launched once. |
| AppImage or Linux without the background service | renCal must be running.                                                                          |
| macOS                                            | renCal must be running.                                                                          |

On a packaged Linux installation, renCal enables and starts the user service automatically when it is available.

If reminders are not appearing, see [Troubleshooting](/docs/troubleshooting/#reminders-are-not-appearing).
