# Calendar provider plugins

A provider follows the [caldir provider protocol](https://caldir.org/providers/). The provider repository contains its binary's source, `rencal-plugin.toml`, and optionally an SVG icon:

```toml
id = "alice.example"
name = "Example Calendar"
description = "Sync Example calendars with renCal"
min_rencal_version = "0.8.0"

[[contributes.providers]]
slug = "example"
name = "Example Calendar"
icon = "icons/example.svg"
asset = "caldir-provider-example-{target}.tar.gz"
caldir_core = "0.16.0"
```

The slug determines the binary name, `caldir-provider-<slug>`, and is stored in users' account configuration. It must use lowercase letters, digits, or hyphens; `google`, `icloud`, `outlook`, `caldav`, and `webcal` are reserved. `caldir_core` must be the version used to build the binary, not a guessed compatibility value. renCal currently requires 0.14.0 or newer.

Publish a stable GitHub release. For each supported target, attach a `.tar.gz` asset whose name matches `asset` after replacing `{target}`. The archive must contain a regular `caldir-provider-<slug>` file at its root or within one top-level directory. renCal accepts Linux x86_64 and aarch64 musl or gnu targets, and macOS aarch64 or x86_64 darwin targets. GitHub must report a SHA-256 digest for each asset. A provider without a compatible release asset is not installable on that platform.

For local testing, renCal runs `bin/caldir-provider-<slug>` from the linked checkout if it exists. Without that file, the plugin supplies its name and icon while renCal can use a matching binary on `PATH`. Keep credentials and calendar data outside the plugin repository.
