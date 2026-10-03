---
title: Create a plugin
description: Build a renCal plugin that adds themes or calendar providers.
---

A plugin is a GitHub repository with a `rencal-plugin.toml` manifest at its root. It can contribute [themes](/docs/plugins/themes/), [calendar providers](/docs/plugins/providers/), or both.

```toml
id = "alice.dusk"
name = "Dusk"
description = "A quiet dark theme for renCal"
min_rencal_version = "0.8.0"

[[contributes.themes]]
id = "dark"
name = "Dusk Dark"
css = "theme.css"
appearance = "dark"
```

The `id` is `<github-owner>.<plugin-name>`, in lowercase, and the owner must match the account that hosts the repository.

## Build it with an agent

renCal ships a skill that teaches coding agents like Claude Code and Codex to build plugins. On Linux, install it with:

```sh
rencal skill install
```

Or copy it [from GitHub](https://github.com/t4t5/rencal/tree/main/skills/rencal) into your agent's skills directory. Then ask your agent something like _"Make a renCal theme based on Tokyo Night"_.

## Test it locally

Add the path to your checkout to `~/.config/rencal/plugins.toml`:

```toml
plugins = [
  "~/dev/rencal-dusk",
]
```

Edits show up immediately, and any manifest errors appear in **Settings → Plugins**.
