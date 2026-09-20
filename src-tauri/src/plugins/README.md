# Plugins

renCal plugins are data-only packages that currently contribute CSS themes. Executable plugin code is not supported.

A plugin is a GitHub repository with a `rencal-plugin.toml` manifest and its contributed files:

```toml
id = "alice.dusk"
name = "Dusk"
version = "1.0.0"
description = "A quiet dark theme for renCal"
min_rencal_version = "0.8.0"

[[contributes.themes]]
id = "dark"
name = "Dusk Dark"
css = "theme.css"
appearance = "dark"
```

For catalog inclusion, give the repository the `rencal-plugin` GitHub topic and use a plugin ID whose owner matches the repository owner. A stable GitHub release is optional. If one exists, its tag must match the manifest version (`1.0.0` or `v1.0.0`); otherwise renCal uses the head of the default branch. Bump the manifest version to publish an update.

renCal resolves the selected release or branch head to a commit SHA before downloading files and records that SHA in `plugins.toml`, so every installed package can be restored from the same source revision.

Users normally install a plugin with the **Install in renCal** button on the [plugin directory](https://rencal.org/plugins), which opens the package in **Settings → Plugins** for review before anything is installed.

On Linux, `rencal plugin install owner/repository` remains available for terminal use and dotfiles.
