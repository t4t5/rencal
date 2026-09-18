---
name: local-caldir
description: Develop renCal against a local caldir checkout instead of the pinned release. Use when the user wants to test unreleased caldir-core or provider changes, or asks to "use local caldir" / "point rencal at my caldir checkout".
---

# Local caldir checkout

renCal pins `caldir-core` (crate) and the provider binaries (release tag) separately in `src-tauri/Cargo.toml`. To develop against a local checkout (`../caldir` by default):

1. **Providers**: `just build-providers-local [path]` builds them from the checkout into `src-tauri/providers/`.
2. **caldir-core**: create a gitignored `.cargo/config.toml` in the repo root that patches the crate (path is relative to the repo root):

   ```toml
   [patch.crates-io]
   caldir-core = { path = "../caldir/caldir-core" }
   ```

   This rewrites `src-tauri/Cargo.lock`; do not commit that change.

3. **Back to the pinned release**: delete `.cargo/config.toml` and `src-tauri/providers/`. The next `just dev` re-downloads the pinned providers.
