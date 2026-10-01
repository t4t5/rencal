---
name: rencal
description: Create and test renCal plugins that contribute themes or calendar providers. Use when someone wants to make, edit, or publish a renCal plugin; use the caldir skill for calendar events.
---

# renCal plugins

Help the user build a plugin in their own checkout. A plugin is a GitHub repository with a `rencal-plugin.toml` at its root. It can contribute CSS themes, calendar providers, or both.

Read the relevant guide before creating files:

- [Themes](references/themes.md) for CSS themes and fonts.
- [Providers](references/providers.md) for calendar sync binaries.

Keep plugin source in the user's checkout. For live testing, add its absolute path or `~/` path to the `plugins` array in `~/.config/rencal/plugins.toml`; renCal links local checkouts and reloads theme edits. Preserve any existing entries and other settings in that file. Avoid editing installed copies under `~/.local/share/rencal/plugins/`.

Check that the manifest names existing files and uses a unique, lowercase `<github-owner>.<name>` ID. For a published plugin, the ID owner must match the GitHub repository owner. Test the local checkout in renCal before publishing. Only create a repository, push, publish a release, or change the user's plugin declarations when the request authorizes that action.
