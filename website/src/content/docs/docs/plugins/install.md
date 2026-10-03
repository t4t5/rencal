---
title: Install plugins
description: Add community themes and calendar providers to renCal.
---

Plugins add **themes** and **calendar providers** to renCal. Find them in the [plugin directory](/plugins/).

## In your config

Your installed plugins are stored in `~/.config/rencal/plugins.toml`, which makes them easy to keep in your dotfiles:

```toml
plugins = [
  "t4t5/rencal-theme-gruvbox",
  "t4t5/caldir-provider-tuta",
]
```

On Linux, you can also install plugins from the terminal:

```sh
rencal plugin install t4t5/rencal-theme-gruvbox
```
