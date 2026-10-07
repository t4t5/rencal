# rencal-theme

Theme format v2 (`GPUI_PORT_PLAN.md` §4): types, JSON Schema, resolver, event colours, Omarchy mapping, built-in themes, and the legacy CSS converter (feature `legacy-css`). No GPUI: colours are `Rgba` (f64, straight alpha, unclamped until output) and metrics are `f64` pixels. The format is documented in `README.md`.

## Layout

- `src/tokens.rs`: the token catalogue. Each token has a key, a `Kind`, a `Derive` rule and the legacy CSS variable it replaces. Adding a token is one entry here; the schema, converter and parity test pick it up.
- `src/resolve.rs`: explicit value → `Derive` rule → baseline (`ren` for dark, `ren-light` for light). Recursive, with cycle detection.
- `src/event.rs`: `event_colors`, the port of the `calendar-event` rules in the old `src/global.css`.
- `src/omarchy.rs`: `omarchy_theme`, the port of `varsFromColors` in `src/hooks/useOmarchyTheme.ts`. Takes a plain `OmarchyColors`; it does not depend on the backend crate.
- `src/legacy.rs` + `src/legacy_baseline.css`: the converter. The baseline CSS is a frozen copy of the old `global.css` token block; don't edit it to change v2 behaviour.
- `themes/*.json`: built-ins, embedded by `src/builtin.rs` (list order = picker order). `ren.json` holds both baselines, `ren` and `ren-light`, which set every `Baseline` primitive explicitly.
- `schema/v1.json`: generated; regenerate with `UPDATE_SCHEMA=1 cargo test -p rencal-theme --test builtins`.
- `tests/fixtures/*.json`: computed values from the Tauri webview's CSS, dumped by `just theme-fixtures` (`scripts/fixtures/themes/`, headless Chromium from nixpkgs). Regenerate them only while the CSS app is the reference. After cutover they are the spec.

## Rules

- Colour maths must match CSS: `Rgba::mix` is `color-mix(in srgb)` with premultiplied alpha. Keep values unclamped through mixes (boosted event colours leave the sRGB gamut) and clip only in `to_hex`/`to_bytes`. OKLCH uses the CSS Color 4 matrices.
- Parity target is ±1/255 per channel against the fixtures, for every built-in, the Omarchy samples, and 11 sample event accents per theme (`tests/parity.rs`).
- One bad key never fails a theme: `ThemeContent::compile` skips it and returns a `Diagnostic`. Only malformed JSON or a malformed family structure is an error.
- Built-ins must load with zero diagnostics (`tests/builtins.rs`).
- Converting a CSS theme: `cargo run -p rencal-theme --features legacy-css --example convert-legacy -- <light|dark> <Name> <file.css> > out.json` (set `RENCAL_CONVERT_BASELINE=1` only when re-converting `ren` + `ren-light` together). The converter emits the smallest theme that resolves to the webview's values, so derived tokens a theme restated are dropped and primitives the CSS took from the dark baseline are pinned (light themes that don't set `success` keep ren's `#4caf50`).
- `wasm` bindings (feature `wasm`, for the website theme builder) are not written yet; they land with Phase 7. Keep the public API free of anything that can't cross `wasm-bindgen` cheaply (plain data in, plain data out).

## Token decisions

CSS variables that became tokens are listed by `TokenDef::css` in `src/tokens.rs`. The rest:

- Became derived tokens: `--lane-height` → `month.lane_height` (`text.scale.xs.line_height + 4`), `--radius-circle` → `radius.circle` (`radius × 1000`, minimal overrides it), `--control-trailing-inset`, `--nav-padding-inline` (custom rules).
- Became helpers, not tokens: `--radius-xs … --radius-4xl` → `ResolvedTheme::radius_step(factor)`.
- New tokens without a CSS variable: `scrollbar.thumb.background` (`border`), `scrollbar.thumb.hover_background` (`border.input`), `scrollbar.track.background`, `week_grid.hour_line` (`border`, the old `--week-grid-background` default), `week_grid.half_hour_line` (transparent, there was none), and the bevel colours `bevel.highlight/light/shadow/dark` (white/black 80%/40% over `background`).
- `--scrollbar-width` (a keyword) → `scrollbar.width` px; 0 (the default) keeps scrollbars hidden. The converter maps `thin` → 8, `auto` → 12.
- `--event-tint-surface` → `event.tint_surface` (documented in the old README; defaults to `background`).
- `--font-sans` is not a token: the baseline `font.body` carries the list. `font.heading/button/numerical` default to `font.mono`. Font lists keep CSS generic names (`system-ui`, `ui-monospace`, `sans-serif`, `monospace`, `-apple-system`); the app maps or skips them.
- Typography roles: `typography.<role>.size/line_height` derive from the scale step the old `[data-typography]` fallback used (heading → `lg`, button → `sm`, numerical → `xs`); `weight` stays unset (component default); `transform` is a baseline primitive (`uppercase` in ren). `normal` in old themes converts to `none`.
- Dropped: `--text-<role>--letter-spacing` (GPUI `TextStyle` had no letter spacing), `--week-grid-background` images (use `week_grid.fill` and the line colours), `--shadow-*` utilities (replaced by slot `shadow`/`border` tokens), `--spacing` (Tailwind's 4px unit; resolved into the metrics that used it), `--breakpoint-xs` (a layout constant in the app).
- Internal constants, not tokens: the event text knobs `--calendar-event-text-max-lightness` (0.45 on light) and `--calendar-event-text-foreground-mix` (60%/50%/40% dark, 0% light) and the 1.4 chroma boost live in `src/event.rs`.
- Tokens spelled like a slot property are that property's value: `toast.text` is the `toast` slot's `text`, `button.border` the `button` slot's `border`, `control.active.border` the `control` slot's `active` border. `ResolvedTheme::slot` reads them back, after any explicit slot key.
- Slot style properties have no derived defaults in this crate: `ResolvedTheme::slot` returns `None` for what a theme leaves unset and the component applies today's look. A state inherits unset properties from the stateless slot.
- Omarchy light palettes pin `surface.tint_step: 0.05`, because the webview painted them over the dark baseline's step, not ren-light's.
