---
title: Agents and the caldir CLI
description: Use coding agents and command-line tools with your local renCal calendar.
---

renCal stores calendars through [Caldir](https://caldir.org), with every event represented by a standard `.ics` file. Agents and scripts can therefore work with your calendar locally without a separate calendar API or MCP server.

## Install the caldir CLI

Follow the [Caldir quick start](https://caldir.org/quickstart/) to install `caldir-cli`.

The CLI uses the same calendar directory and provider configuration as renCal. Changes made through the CLI appear in renCal automatically, and connected calendars can be synced through the same provider system.

## Give an agent calendar tools

Install the [caldir skill](https://caldir.org/skill.md) for an agent such as Codex, Claude Code, or OpenCode. It teaches the agent how to inspect, create, edit, and sync calendar events using the CLI.

You can then ask for tasks such as:

- “What is on my calendar next week?”
- “Add lunch with Sam tomorrow at 1.”
- “Move Friday's project review to 3pm.”

<video src="/docs/agent.mp4" autoplay loop muted playsinline></video>

## Calendar files

Calendar data lives under `~/caldir/` by default. Each calendar is a directory containing `.ics` event files and Caldir metadata. The data directory can be changed under **Settings → General**.

Because the files are local, they can be backed up with normal file tools. renCal watches the directory for `.ics` changes, so edits made by another program are reflected without importing the files again.

## Privacy and safety

Calendar files can contain private names, email addresses, locations, notes, and meeting links. Review an agent's requested permissions and proposed changes before allowing it to modify or sync your calendar.

Before sharing an `.ics` file in a bug report, remove any personal information that is not needed to reproduce the problem.
