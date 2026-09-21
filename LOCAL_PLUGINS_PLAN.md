# Local plugins plan

Let `~/.config/rencal/plugins.toml` point a plugin at a checkout on disk instead of a GitHub repository, so theme edits show up in the running app. The workflow mirrors lazy.nvim's `dir` option: keep the GitHub line, add a local line while developing, and remove it when done.

```toml
plugins = [
  "t4t5/rencal-theme-gruvbox",
  "~/dev/ren/rencal-theme-gruvbox", # local checkout, wins while present
]
```

## What already works

- `scan_packages` in `src-tauri/src/plugins/mod.rs` follows symlinked package directories (tested by `scan_follows_symlinked_package_directories`).
- `reconcile` in `src-tauri/src/plugins/installer.rs` leaves directories without a lock entry alone (tested by `reconcile_leaves_an_unlocked_symlinked_checkout_alone`). The escape hatch today is a hand-made symlink under `~/.local/share/rencal/plugins/<id>`.
- The theme watcher in `src-tauri/src/external_themes.rs` watches the plugins directory recursively, and notify 6.1.1's inotify backend walks with `follow_links(true)`, so CSS edits inside an existing symlinked checkout already trigger a rescan.
- The `plugins.toml` writer (`update_plugins_document`) preserves unknown strings, comments and formatting, so new string forms survive installs and uninstalls untouched.

## Design

### Declarations

A local plugin is a plain string in the existing `plugins` array. A string is local when it starts with `/` or `~/` (or is exactly `~`). Everything else must be `owner/repo` as today. Relative paths (`./`, `../`) are rejected with a clear error; they have no obvious base directory when `plugins.toml` is a dotfiles symlink.

Reasons for a string over an inline table (`{ repo = ..., dir = ... }`): it keeps the single-string record chosen in commit 37a87c1, the comment-preserving writer needs no changes, and the toggle is one line, like the commented `dir` in the sie.nvim spec.

### Lock file

`plugins.lock` gains a second array. Repository entries are unchanged.

```toml
[[plugins]]
id = "t4t5.gruvbox"
repo = "t4t5/rencal-theme-gruvbox"
version = "1.0.0"
commit = "6c66ffc4af3df02b05aa6930c37d781946f22ec5"

[[local]]
id = "t4t5.gruvbox"
dir = "/home/t4t5/dev/ren/rencal-theme-gruvbox"
```

- `dir` is the expanded absolute path.
- A `local` entry proves renCal created the symlink, so removing the declaration later prunes it. This is the same rule that lets renCal delete managed downloads.
- Ids are unique within `plugins` and within `local`, but the same id may appear in both. That is a shadowed repository (below).

### Package directory

A local declaration is materialised as a symlink `~/.local/share/rencal/plugins/<manifest id>` pointing at the checkout. This keeps scanning and package lookup under the existing plugins directory. Font loading must accept the resolved checkout as the package root, while still requiring font files to stay inside that package. Reading themes straight from the checkout was rejected: the scanner requires the directory name to equal the manifest id, font loading resolves packages under the plugins directory, and the watcher would need extra roots.

### Shadowing: local wins

If a local checkout's manifest id matches a managed repository install, the local checkout takes the package slot:

- The managed download is removed from disk. Its `plugins` lock entry is kept.
- Reconcile does not re-download it: the existing "missing" check tests `is_dir()` on `plugins/<id>`, which is true through the symlink.
- When the local line is removed, prune deletes the symlink, the repository entry's directory is now missing, and the existing restore path fetches the exact locked commit. No latest-release resolution happens.
- If the repository line is added while a local entry exists, restore resolves it once, then `install_resolved` records the lock entry without touching the directory. Later reconciles make no network requests.
- Explicit installs (Settings, CLI, deep link) of a locally provided id fail with an error that names the checkout and tells the user to remove that line.

### Errors the user can see

Reconcile errors are only logged today. `list()` must recompute the checks that matter so Settings > Plugins can show them:

- Declared directory does not exist, or has no readable `rencal-plugin.toml`, or the manifest is invalid: an entry in `InstalledPlugins.errors` naming the path. No symlink is created in this case, because the scanner silently skips dangling symlinks.
- `plugins/<id>` is a real directory with no lock entry (a manual copy): an error saying it must be removed by hand. Never delete unlocked directories.

### Theme watcher

notify only adds watches for new entries whose inotify event carries `ISDIR`. A symlink created by reconcile after startup produces a plain file create, so its target is never walked. The theme watcher therefore rebuilds its `FsWatch` whenever a changed path is a direct child of the plugins directory. The rebuild walks the tree again with `follow_links(true)` and picks up the new checkout.

### Platform

Symlink creation is `#[cfg(unix)]`. Other platforms return a Configuration error ("local plugins are not supported on this platform yet"). The Windows port should use directory junctions here.

## Implementation steps

### 1. Declarations (`src-tauri/src/plugins/mod.rs`)

- Add `pub enum PluginDeclaration { Repository(String), Local(PathBuf) }` and `PluginDeclaration::parse(value: &str) -> Result<Self, PluginError>`.
- Add `fn expand_home_with(value: &str, home: &Path) -> Result<PathBuf, PluginError>` and a `pub fn expand_home(value: &str)` wrapper over `dirs::home_dir()`. Only `~` and `~/...` are expanded.
- Keep `PluginsFile.plugins: Vec<String>` and the writer as they are. Add `PluginsFile::declarations()` returning parsed entries for callers that need the split.
- Update `validate_plugins_file`: repository strings keep the current checks and case-insensitive dedupe; local strings must expand, and are deduplicated by expanded path.
- Add `LocalLockEntry { id: String, dir: String }` and `PluginLockFile.local: Vec<LocalLockEntry>` with `#[serde(default)]`. Extend `validate_plugin_lock_file`: `validate_package_id` on each local id, `dir` must be absolute, no duplicate local ids. Do not reject an id that appears in both arrays.

Tests:

- `parses_local_and_repository_declarations`: `~/x`, `/x` are local; `./x`, `../x`, `~user/x`, `~/` alone are errors; `alice/dusk` is a repository.
- `local_declarations_dedupe_by_expanded_path` using `expand_home_with` and a fixed home.
- `plugins_file_preserves_local_declaration_strings_on_save`: extend the `FUTURE_PLUGINS` fixture with a `~/...` line and assert it survives verbatim.
- `plugin_lock_file_round_trips_local_entries` including an id shared with a repository entry, and rejection of a relative `dir` and duplicate local ids.

### 2. Applying local declarations (`src-tauri/src/plugins/installer.rs`)

Add `fn apply_local(&self, declarations: &PluginsFile, locks: &mut PluginLockFile) -> Vec<PluginReconcileError>`, called from `reconcile` after `prune_undeclared` and before the missing-repository computation. Recompute the missing set from the updated locks.

For each local declaration:

1. Expand the path. If it is not a directory, push an error and continue.
2. Read and `validate_manifest` with `running_app_version()`. Skip `validate_manifest_owner`; there is no repository. Push an error on failure.
3. Take `id = manifest.id`. If another local declaration already claimed it in this pass, push an error for this one.
4. Inspect `plugins/<id>` with `symlink_metadata`:
   - Symlink to the same target: nothing to do.
   - Symlink elsewhere: rename the existing symlink into the backup tempdir, then create the replacement, so the previous link can be restored on failure.
   - Real directory with a `plugins` lock entry of that id: rename into a `.rencal-shadow-` backup tempdir (same pattern as `prune_undeclared`), then create the symlink. Keep the repository lock entry.
   - Real directory with no lock entry: push an error, leave it.
   - Missing: create the symlink.
5. Upsert `LocalLockEntry { id, dir }`; remove any other local entry for the same id.

Track moved directories and symlinks, plus newly created symlinks. If symlink creation fails, restore that entry's previous directory or symlink before reporting the error; only upsert its lock entry after creation succeeds. Save the lock once at the end. If saving fails, unlink newly created symlinks before restoring moved entries in reverse order, and restore the previous in-memory locks. The existing prune rollback alone is insufficient: a directory cannot be renamed back over its replacement symlink. Rollback must never remove checkout contents.

Tests:

- `apply_local_restores_a_managed_directory_when_symlink_creation_fails`: force creation to fail after the directory is moved; assert the original package and locks remain intact.
- `apply_local_rolls_back_when_lock_save_fails`: cover a replaced managed directory, a replaced symlink and a previously empty slot. Assert the original directory or symlink is restored, new links are removed, locks are unchanged and checkout contents are untouched.

### 3. Prune (`prune_undeclared`)

Extend to local entries: a `local` lock entry whose `dir` matches no declared local path (compare expanded paths) is removed, and `plugins/<id>` is renamed into the backup tempdir when it is a symlink. If the slot holds a real directory, leave it and only drop the entry. A path edit in `plugins.toml` therefore prunes the old entry and applies the new one in a single reconcile.

### 4. Install guard (`install_resolved`)

After `write_staged_package` and the `RequireExisting` reload, check `locks.local` for `package.manifest.id`:

- `DeclarationPolicy::RequireExisting` (reconcile restore): upsert the repository lock entry, save it, return `Ok` without touching `target`.
- `DeclarationPolicy::Ensure` (Settings, CLI, deep link): return an `InvalidInput` error: `plugin id "t4t5.gruvbox" is provided by the local checkout at /home/... ; remove that line from plugins.toml to install from GitHub`.

### 5. Uninstall (`uninstall`)

Also remove the `local` entry, its symlink (rename into the backup, as now), and the local declaration whose expanded path equals the lock `dir`. Keep the existing order: lock first, then declarations, with rollbacks. A shadowed id removes both the local and repository entries.

### 6. Listing (`list`)

- Add `local_dir: Option<String>` to `InstalledPlugin`.
- Build rows from repository entries as today, then for each local entry find the row by id or push one, set `local_dir`, and clear the "Package files are missing" error. The scan fills name and version through the symlink.
- Skip the catalog update comparison for rows with `local_dir`.
- Recompute the errors from the design section for each local declaration and append them to `errors`.

Tests, using the existing `manager()` fixture, `serve_v1` and `FixtureDownloader::request_count`:

- `reconcile_links_a_local_checkout_and_lists_it`
- `reconcile_repoints_a_local_checkout_when_its_path_changes`
- `local_checkout_shadows_a_managed_install_and_restore_uses_the_locked_commit`: install `Alice/rencal-dusk`, add a local line with the same id, assert the managed directory is gone, the symlink exists, the repository lock entry is kept; remove the local line, assert the commit URL was fetched and not the release URL.
- `repository_added_while_local_exists_records_the_lock_only`: one resolution, symlink untouched, second reconcile makes no requests.
- `install_refuses_a_locally_provided_id`
- `missing_local_directory_is_reported_and_creates_no_symlink`
- `unlocked_manual_directory_blocks_a_local_checkout`
- `prune_removes_the_symlink_but_not_the_checkout`
- `uninstall_removes_local_entry_symlink_and_declaration`
- `list_hides_updates_for_local_checkouts` with a newer catalog version.

### 7. Font loading (`src-tauri/src/external_themes.rs`)

In `load_fonts_from`, remove the requirement that `canonical_package` stays inside the canonical plugins directory. Resolve the package through `plugins/<id>` as today, and use its canonical target as the package root, including when it is a local checkout outside the plugins directory.

Keep manifest validation, the package-id and theme-id checks, and the requirement that each canonical font path stays inside `canonical_package`. Keep WOFF2 validation and font size limits unchanged.

Tests:

- `loads_fonts_from_a_symlinked_checkout`: a package symlink pointing outside the plugins directory loads its declared font; a fontless checkout returns an empty result without an error.
- `rejects_fonts_resolving_outside_a_local_checkout`: a declared font symlink pointing outside the checkout is still rejected.

### 8. Theme watcher (`src-tauri/src/external_themes.rs`)

In `run_watcher`, after `watch.changed()` returns paths, rebuild the watch with `watch_debounced` when any path's parent equals `plugins_dir`, then emit the scan as now. One-line comment on why (inotify does not follow a symlink created after the walk).

Verify manually rather than with a unit test unless a symlink-after-watch test in `fs_watch.rs` proves stable across runs.

### 9. Routes, bindings and UI

- `just gen-types` after the `InstalledPlugin` change. No route signatures change.
- `src/components/settings/plugins/PluginsPage.tsx`:
  - Replace the "Installed locally" note: when `installed.local_dir` is set show `Local checkout · <dir>`, and `shadows <repo>` when `repo` is also set. Keep "Installed locally" for unlocked directories.
  - `PluginActions`: rows with `local_dir` show only Uninstall.
  - Search should match `local_dir`.
- `src/components/settings/plugins/PluginsPage.test.tsx`: a local row renders the path and no update or reinstall button even with a newer catalog version; a shadowed row names the repository.

### 10. Docs

Update `src-tauri/src/plugins/README.md`: the declaration example gains a local line, a paragraph explains the string form, that the checkout must contain `rencal-plugin.toml`, that local wins over a same-id repository and restores it on removal, and the symlink placement. The website has no `plugins.toml` docs today, so nothing to change there.

### 11. Verification

- `just check` and `just test`.
- Manual, with `just debug` and the real config:
  1. Start with only the repository line. Settings > Plugins shows the managed install.
  2. Add `"~/dev/ren/rencal-theme-gruvbox"`. The row switches to the local checkout, `ls -la ~/.local/share/rencal/plugins` shows the symlink, `plugins.lock` holds both entries.
  3. Edit `themes/dark.css` in the checkout with the theme active. The app updates without a restart.
  4. Remove the local line. The symlink is gone, the managed package is back, and the `commit` in `plugins.lock` is unchanged from step 1. The automated shadowing test covers the request pattern.
  5. Put the local line back and run `rencal plugin install t4t5/rencal-theme-gruvbox`. It fails with the "provided by the local checkout" message.

## Notes

- The dev build and the installed app share `plugins.toml` and the plugins directory, so a local line applies to both, as in neovim.
- Download-time size limits (`CSS_FILE_LIMIT`, `PACKAGE_LIMIT`) do not apply to local checkouts, matching manual symlinks today. Font limits still apply at theme-apply time through `load_fonts_from`.
- Out of scope: `rencal plugin install <path>`, relative paths, a global development root like lazy.nvim's `dev.path`, Windows junctions.
