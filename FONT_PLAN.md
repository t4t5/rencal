# Bundled Fonts for Plugin Themes

## Objective

Allow a data-only renCal plugin to bundle WOFF2 fonts for its themes. Font files
must be declared and validated by the plugin manifest, installed and restored
with the rest of the package, loaded only when one of that package's themes is
active, and removed from the document when it is no longer needed.

The initial use case is the Windows 98 theme, which needs regular and bold
`Pixelated MS Sans Serif` faces while remaining self-contained and usable
offline.

## Why this belongs in the plugin contract

External theme CSS is inserted inside a generated
`[data-theme="<id>"] { ... }` rule. A theme therefore cannot place a normal
top-level `@font-face` declaration in its CSS. The webview also cannot read
arbitrary files from an installed plugin directory, and the installer currently
downloads only files explicitly named by the manifest.

Fonts should consequently be first-class, package-level contributions rather
than implicit relative URLs or Base64 data embedded in theme CSS. This keeps
plugins data-only, makes every installed file auditable, preserves offline
operation, and lets multiple themes in one package share the same faces.

## Proposed manifest format

Add a package-level `fonts` collection under `contributes`:

```toml
id = "t4t5.windows98"
name = "Windows 98 Theme"
version = "1.1.0"
description = "Classic silver controls, beveled panels, and navy title bars for renCal."
min_rencal_version = "<first-version-with-plugin-fonts>"

[[contributes.fonts]]
family = "Pixelated MS Sans Serif"
file = "fonts/ms_sans_serif.woff2"

[[contributes.fonts]]
family = "Pixelated MS Sans Serif"
file = "fonts/ms_sans_serif_bold.woff2"
weight = 700

[[contributes.themes]]
id = "windows98"
name = "Windows 98"
css = "themes/windows98.css"
appearance = "light"
```

`weight` defaults to `400` and `style` defaults to `normal`. The first version
supports WOFF2 only. A package's fonts are available whenever any theme from
that package is active. Loose single-file themes do not gain sidecar font
support in this change.

Theme CSS continues to use ordinary font-family values:

```css
--font-body: "Pixelated MS Sans Serif", Arial, sans-serif;
--font-heading: "Pixelated MS Sans Serif", Arial, sans-serif;
--font-button: "Pixelated MS Sans Serif", Arial, sans-serif;
--font-numerical: "Pixelated MS Sans Serif", Arial, sans-serif;
```

Putting fonts under `contributes.fonts` is also deliberately forward-compatible:
older renCal releases reject an unknown contribution instead of silently
ignoring an unknown field inside a theme. Authors must still set
`min_rencal_version` to the first compatible renCal release.

## Contract and validation

In `src-tauri/plugin-contract/src/lib.rs`:

1. Add a `FontContribution` type with `family`, `file`, `weight`, and `style`.
2. Add `fonts: Vec<FontContribution>` with `#[serde(default)]` to
   `Contributions`.
3. Extend `reject_unsupported_contributions` to accept `fonts` alongside
   `themes`.
4. Validate each font before returning the manifest:
   - `family` is trimmed, non-empty, contains no control characters, and is no
     longer than 100 characters;
   - `file` is a relative package path with no empty, `.` or `..` components,
     no leading slash, backslash, or colon, and a case-sensitive `.woff2`
     suffix;
   - `weight` is in `1..=1000` and defaults to `400`;
   - `style` is a serialized enum containing `normal`, `italic`, and `oblique`,
     and defaults to `normal`;
   - no two entries have the same normalized `(family, weight, style)` tuple;
   - cap the collection at eight faces per package.
5. Refactor the existing CSS-path check into a reusable safe-relative-path
   helper so CSS and fonts share traversal protection while retaining their own
   extension checks and error messages.

Add contract tests for defaults, every accepted style, boundary weights,
duplicate faces, excessive face counts, invalid paths, invalid extensions,
control characters, and old/new `contributes` key handling.

The manifest validator can check the declared extension, but byte validation
must happen after download. Require the four-byte WOFF2 signature `wOF2` before
staging a font.

## Installation and restoration

In `src-tauri/src/plugins/installer.rs`:

1. Introduce a `FONT_FILE_LIMIT` of 1 MiB while retaining the existing 4 MiB
   total package limit initially.
2. Build a deduplicated list of declared package files from theme CSS paths and
   font paths. Fetch a path only once even when future contributions share it.
3. Continue resolving every download against the already pinned commit SHA.
4. Apply the appropriate per-file limit, include every byte in the aggregate
   package-size calculation, sniff the WOFF2 signature, and write into the
   existing staging directory.
5. Preserve the current atomic package replacement and rollback behavior.

`restore_missing` already resolves the locked commit and runs the normal staged
installation path. Keeping font downloads in `write_staged_package` therefore
makes restore support automatic. Extend installer fixtures and tests to prove:

- valid CSS and fonts are installed together;
- a missing, oversized, malformed, or wrong-signature font aborts the entire
  install without replacing an existing package;
- the total package limit includes fonts;
- shared paths are fetched once;
- restore fetches fonts from the exact locked commit;
- updating replaces old font bytes with the new package version.

## Inspection and installation review

Extend `PluginInspection` with font metadata derived from the manifest. The
review dialog should show a compact `Fonts` section containing family, weight,
style, and file name, or a simple summary followed by expandable details.

Inspection does not download contributed files today. Do not add extra network
requests merely to display byte sizes; size and signature enforcement remains
part of installation. Update the Rust inspection tests and
`PluginsPage`/`PluginReview` frontend tests for packages with and without fonts.

## Runtime data model and lazy RPC

Do not include font bytes in `ExternalThemesSnapshot`. The plugin-directory
watcher republishes that entire snapshot on any package change, so embedding
fonts there would repeatedly move inactive binary data across IPC.

The existing plugin variant of `ExternalThemeSource` already carries package ID
and version, which is enough to identify ownership and key a frontend cache. Do
not add font contents or filesystem paths to that snapshot. Add a lazy themes
API operation along these lines:

```text
themes.load_fonts(theme_id) -> ExternalThemeFonts
```

The backend implementation must:

1. Resolve the exact installed package and theme by the fully qualified theme
   ID; never accept a caller-provided filesystem path.
2. Re-read and validate that package's manifest using the normal scanner.
3. Read only its declared font paths beneath the package directory.
4. Recheck the file limit and WOFF2 signature so hand-edited installed packages
   fail safely.
5. Return each face's family, weight, style, and Base64-encoded bytes.
6. Return an empty collection for loose themes and packages without fonts.
7. Surface missing or invalid active-theme fonts as a classified theme error
   while allowing the CSS fallback font stack to render.

Base64 is intentional at the RPC boundary. It avoids serializing a large
`Vec<u8>` as an array of JSON numbers and is still only requested for the active
package.

Regenerate `src/rpc/bindings.ts` with `just gen-types`, expose the operation and
types through `src/lib/api/themes.ts` and `src/lib/api/index.ts`, and keep UI code
away from the raw RPC proxy.

## Frontend font lifecycle

Load the returned Base64 into the CSS Font Loading API rather than generating
data-URL `@font-face` rules:

```ts
const bytes = Uint8Array.from(atob(font.data), (character) => character.charCodeAt(0))
const face = new FontFace(font.family, bytes, {
  weight: String(font.weight),
  style: font.style,
})
await face.load()
document.fonts.add(face)
```

Using binary `FontFace` objects means the existing `font-src 'self'` CSP can
remain unchanged. It also avoids CSS-string construction and prevents
undeclared data fonts from becoming generally loadable through plugin CSS.

Create a small external-font lifecycle module or hook with these behaviors:

1. Apply theme CSS immediately so theme switching remains responsive and
   fallback fonts are always usable.
2. When a plugin theme becomes active, lazily request its package fonts, load
   all faces, and add them to `document.fonts`.
3. Guard the asynchronous result with a generation token or cancellation flag;
   a slow response for a previously active theme must never register stale
   faces.
4. Track every `FontFace` object registered for the active package and remove it
   with `document.fonts.delete` when switching to a built-in, loose theme, or a
   theme from another package.
5. Reuse already loaded faces while switching between themes in the same
   package. Key any cache by package ID and version so a plugin update
   invalidates old bytes.
6. If one face fails, remove any faces added for that load attempt, report the
   failure, and leave the theme running with its CSS fallbacks.
7. On plugin watcher updates, unload cached faces whose package version or
   declaration has changed, then reload if that package remains active.

Keep external stylesheet ownership in `src/themes/external.ts`. Integrate the
font lifecycle from `useTheme` or a focused hook rather than mixing RPC and
binary decoding into the pure stylesheet helper.

Add frontend tests with a mocked `FontFace` and `document.fonts` covering
registration, cleanup, same-package reuse, stale asynchronous results, plugin
updates, load failure, built-in and loose-theme transitions, and themes with no
fonts.

## Body typography token

Bundled fonts are only useful if all intended typography can opt into them.
`--font-body` exists in the `bodytext` utility, but the application body itself
currently uses `var(--sans)` directly. Independently of the plugin transport,
change the base body declaration to:

```css
font-family: var(--font-body, var(--sans));
```

Document `--font-body` and `--font-body-transform` alongside the existing
heading, button, and numerical tokens in `src/themes/README.md`. Existing themes
remain unchanged through the fallback. The Windows 98 theme already applies
`--font-body` through a custom root rule, but this change makes it part of the
supported theme contract rather than a theme-specific workaround.

## Security and failure model

- Do not enable Tauri's asset protocol or expose plugin directories to the
  webview.
- Do not add `data:` or `blob:` to `font-src`.
- Do not accept filesystem paths through RPC.
- Treat installed plugin contents as untrusted even though their source commit
  was validated during installation.
- Keep the existing package-wide download cap and atomic staging behavior.
- A font failure must degrade to the CSS fallback stack, not disable the theme
  or prevent application startup.
- Plugin authors remain responsible for the right to redistribute their font
  files and for including required license and attribution notices in their
  repository.

## Documentation

Update:

- `src-tauri/src/plugins/README.md` with the manifest syntax, defaults, limits,
  WOFF2 requirement, offline behavior, and licensing responsibility;
- `src/themes/README.md` with the new body token and a short example using a
  manifest-declared family;
- the generated custom-theme README only if loose themes gain fonts later;
- plugin author examples and test fixtures to use the new minimum renCal
  version.

The first consumer should update the Windows 98 theme plugin to bundle the two
WOFF2 files, declare regular and bold faces, switch its typography variables to
`Pixelated MS Sans Serif`, retain Arial/sans-serif fallbacks, and include the
upstream font/code attribution required by its source.

Inactive theme preview tiles may continue to use fallback fonts in the first
version. Loading every installed font merely to render the settings grid would
undo the lazy-loading design and is not required for the selected theme to be
accurate.

## Implementation sequence

1. Add the shared manifest types, defaults, validation, and contract tests.
2. Generalize staged package file collection and add bounded WOFF2 downloads,
   signature checks, deduplication, and installer/restore tests.
3. Add font metadata to plugin inspection and update the review UI and tests.
4. Add the lazy backend font route, generated bindings, and public frontend API.
5. Implement the `FontFace` lifecycle and race-safe theme integration with
   frontend tests.
6. Promote `--font-body` to a base typography token and update theme docs.
7. Update plugin documentation and representative manifest fixtures.
8. Add an indexer fixture proving a repository with `contributes.fonts` is
   accepted and still reported as a theme plugin; the indexer otherwise gains
   the schema through the shared contract crate.
9. Update and visually verify the Windows 98 theme as the integration test.

## Verification

Run:

```sh
just gen-types
just test
just check
```

Also verify manually in the Tauri webview:

- install the Windows 98 plugin while online, then restart offline;
- select its theme and confirm regular and bold faces render;
- switch repeatedly between its theme, a built-in theme, and a loose theme;
- update and uninstall the plugin while its theme is selected;
- corrupt or remove a font from an installed package and confirm graceful
  fallback plus a useful error;
- confirm no font bytes appear in the external-theme snapshot;
- confirm the CSP remains unchanged and the webview has no general path to the
  plugin directory;
- confirm inactive theme previews remain responsive and acceptable with
  fallback typography.

## Acceptance criteria

- Plugin authors can bundle regular and bold WOFF2 faces without Base64 CSS,
  remote URLs, wrapper escapes, or application code changes per theme.
- Every installed font is named in the manifest, path-validated, size-bounded,
  signature-checked, downloaded from the pinned commit, and restored with the
  package.
- Fonts cross IPC only when a theme from their package is active.
- Switching themes and updating or uninstalling plugins leaves no stale font
  faces registered in the document.
- Missing or invalid fonts fall back cleanly without breaking the active theme.
- Existing plugins, loose themes, built-in themes, CSP restrictions, and theme
  previews continue to work.
- The plugin review discloses bundled font contributions before installation.
- `just test` and `just check` pass with generated bindings committed.

## Deferred work

- Generic plugin assets such as images, cursors, icons, and sounds.
- A restricted `rencal-plugin:` URI scheme or Tauri asset-protocol integration.
- Fonts for loose single-file themes.
- Loading plugin fonts in inactive theme preview tiles.
- Additional font formats or variable-font-specific descriptors.
