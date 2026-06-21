---
title: Calendars
description: How renCal stores and syncs calendar data.
---

renCal uses [Caldir](https://caldir.org) to store calendars locally.

A calendar is a directory, and each event is a standard `.ics` file inside that directory.

## Local calendar files

Because events are plain files, you can:

- inspect them with normal command-line tools,
- back them up with your usual backup system,
- script around them,
- or use the `caldir` CLI for advanced workflows.

This also makes renCal friendly to coding agents and automation tools.

## Calendar providers

renCal can sync with existing calendar services through provider integrations.

Common providers include:

- Google Calendar
- iCloud Calendar
- Outlook
- CalDAV servers

Provider support is handled through the Caldir provider ecosystem.

## Sync behavior

renCal keeps a local copy of your calendars and syncs changes with connected providers.

This means you can view your calendar while offline. Changes made locally are synced when the provider is available again.

## Where data lives

Your calendar data lives on your machine as caldir files. The exact location may depend on your system configuration and connected providers.
