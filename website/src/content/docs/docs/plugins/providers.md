---
title: Provider plugins
description: Add support for a new calendar service with a provider plugin.
---

A provider plugin lets renCal sync with a new calendar service. The provider is a `caldir-provider-<slug>` binary that follows the [caldir provider protocol](https://caldir.org/providers/), like the [Tuta provider](https://github.com/t4t5/caldir-provider-tuta).

Add a `rencal-plugin.toml` to its repository:

```toml
id = "alice.example"
name = "Example Calendar"
description = "Sync Example calendars with renCal"
min_rencal_version = "0.8.0"

[[contributes.providers]]
slug = "example"
name = "Example Calendar"
icon = "icons/example.svg"
bin = "caldir-provider-example-{target}.tar.gz"
```

- `slug` is the URI-friendly name of the provider (e.g. `google`, `fastmail`, `zoho`...)
- `icon` is the logo or icon show for the provider.
- `bin` is the name of the release archive that holds the binary.

## Release assets

Providers install from the latest stable GitHub release. Attach one archive per platform, with `{target}` in `bin` replaced by one of:

| Platform      | Targets                                                     |
| ------------- | ----------------------------------------------------------- |
| Linux x86_64  | `x86_64-unknown-linux-musl` or `x86_64-unknown-linux-gnu`   |
| Linux aarch64 | `aarch64-unknown-linux-musl` or `aarch64-unknown-linux-gnu` |
| macOS         | `aarch64-apple-darwin` or `x86_64-apple-darwin`             |

Each archive must contain the `caldir-provider-<slug>` binary, at its root or inside one top-level folder.
