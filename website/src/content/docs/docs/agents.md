---
title: Agents
description: Use agents like Claude Code and Codex to automate your calendar workflows
---

renCal stores events as plain `.ics` files through Caldir, so agents and scripts can work with your calendar locally without an API.

The [caldir skill](https://caldir.org/skill.md) makes it easier for agents like Claude Code and Codex to create and edit events for you. It needs the [caldir CLI](https://caldir.org/quickstart/). Once that's installed, tick **caldir** in **Settings → Agents** to add the skill to every supported agent renCal finds. renCal keeps it up to date and removes it when you untick it.

<video src="/docs/agent.mp4" autoplay loop muted playsinline></video>

To have an agent build views, themes or providers for renCal, tick **renCal** in the same place. See [Build it with an agent](/docs/plugins/create/#build-it-with-an-agent).

Agents can also drive the open app: `rencal commands` lists what renCal can do, and `rencal do` runs it, like `rencal do date.go 2026-11-02`. They can rebind your keys in `~/.config/rencal/keys.toml` too. See [Keyboard Shortcuts](/docs/keyboard-shortcuts/#run-commands-from-the-terminal).
