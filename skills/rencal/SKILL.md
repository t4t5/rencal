---
name: rencal
description: Create and test renCal plugins that contribute views, themes or calendar providers. Use when someone wants a custom renCal view ("build a renCal view that shows…"), or wants to make, edit, or publish a renCal plugin; use the caldir skill for calendar events.
---

# renCal plugins

Help the user build a plugin. A plugin is a directory with a `rencal-plugin.toml` at its root, published as a GitHub repository when the user wants to share it. It can contribute views, CSS themes, calendar providers, or a mix.

Read the relevant guide before creating files:

- [Views](references/views.md) for custom calendar views.
- [Themes](references/themes.md) for CSS themes and fonts.
- [Providers](references/providers.md) for calendar sync binaries.

Keep plugin source in the user's checkout. For live testing, add its absolute path or `~/` path to the `plugins` array in `~/.config/rencal/plugins.toml`; renCal links local checkouts and reloads their edits. Preserve any existing entries and other settings in that file. Avoid editing installed copies under `~/.local/share/rencal/plugins/`.

Check that the manifest names existing files and uses a unique, lowercase `<github-owner>.<name>` ID. For a published plugin, the ID owner must match the GitHub repository owner. Test the local checkout in renCal before publishing. Only create a repository, push, or publish a release when the request authorizes that action.

To list a published plugin in the directory, add the `rencal-plugin` GitHub topic. A `preview.png` at the repository root is optional. It appears in the directory and, for a local checkout, in **Settings → Plugins**. The directory reads it from the default branch, so updating it needs no release. Use a 16:9 screenshot of the plugin in renCal: a view showing realistic events, or a theme's dark and light variants combined in one image. Ask the user to take it rather than drawing a mockup.
