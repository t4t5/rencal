# renCal on NSH

The NSH port of renCal: a mixed app (TSX screens on QuickJS, a Rust crate in `native/`). The React app in `../src` and the Tauri backend in `../src-tauri` stay as the reference for behaviour and look; port from them, don't reinvent. Read the NSH skill (`skills/nsh` in `longbridge/nsh`) before using an API you haven't used here.

## Commands

Run from `app/`, with `~/.local/bin` on `PATH`. The `nsh` CLI must match the version of nsh's crates in `native/Cargo.toml`, since it generates the hosts and the type declarations: `nsh update` installs the latest release.

- `nsh check`: `cargo check`, then `tsc`. The only type check.
- `nsh build`: read every warning; it reports unknown classes.
- `nsh test .`: every Rust and TS test.
- `nsh run .`: the app, TSX hot, Rust restarts. Never run it against real data while developing: set `XDG_CONFIG_HOME` to an isolated config (`.agents/skills/screenshots` makes one).
- `RENCAL_ANNOTATE=1 nsh run .`: annotate mode (`mod+shift+a`), for the user's feedback. Each save is a Markdown file of pinned notes, with where each points and the app's state, plus a screenshot, in `../.agents/feedback/`: read the newest when they mention notes. Views name themselves to it with `ref={inspectable(...)}` (`lib/inspect.ts`).

## Layout

- `native/`: the backend. `routes/dispatch.rs` lists every procedure, reached through `Backend.call`. `host.rs` replaces Tauri's `AppHandle`.
- `rpc/`: `bindings.ts` is still the typed contract, copied from `../src/rpc`. `proxy.ts` gives `rpc.caldir.list_events(...)` over `Backend.call`.
- `lib/`: logic from `../src/lib`, unchanged wherever possible. Keep its tests passing.
- `stores/`: module-level signals, in place of React contexts. One owner per piece of state; read through functions.
- `components/`, `views/`: UI. `components/ui/` is the styled kit over `nsh/base`.
- `themes/`, `theme.json`: tokens. `themes/index.ts` applies a theme at run time.

## Conventions

- Imports are absolute (`@/`); relative only for same-directory siblings. No `any`.
- Colors are theme tokens (`bg-selected`, `text-muted-foreground`). The one exception is event colors, from `lib/event-paint.ts`, which come from data.
- Typography that was `data-typography="heading|button|numerical"` is `font-mono` with `displayCase()` from `@/themes`, a class that follows the theme; a static `uppercase` stays uppercase on themes that turned it off. Headings take their weight from `displayWeight()` (regular unless the theme sets `text-heading--font-weight`), not `font-bold`. Radii go through tokens (`rounded-(--radius-md)`), because Ren's are 0.
- Control sizes go through tokens: `h-(--control-height)`, `p-(--layout-padding)`.
- Backend access goes through `@/lib/api`, never `rpc` directly.

## What differs from React and the web

- A component runs once. Read props and signals in JSX or closures, never destructure props or read them in the body. In `Each` and `List`, items are accessors: `row().title`.
- `List` cells are recycled: no per-row signals, no `const x = row().y` at the top of the row.
- `<If>` for branches with state, `<Each key=...>` for lists; `cond && <X/>` and `.map` rebuild.
- All text goes in `<Text>`; a bare string or number in a `View` shows nothing and passes every tool.
- Text color doesn't default to the theme: it inherits from a parent with `text-*`. The root sets `text-foreground`.
- `numberOfLines` is a style: use `line-clamp-1` or `truncate`.
- `Image` takes `src`; `onLayout` gives `{ bounds: { origin, size } }`.
- `signal(..)`, `spawn` and other runtime calls panic in a synchronous `#[module]` member (`no reactive runtime`). Make the member `async` or take `cx`.
- `Intl` needs `new`, and only knows the device's zone and UTC. Named zones are `lib/temporal.ts`, which `nsh.json` aliases `@js-temporal/polyfill` to. There's no `Temporal`, `window`, `document` or `localStorage` (`@/lib/local-storage` has its surface).
- `List` keeps every size it measured, so after a resize its offsets are no longer multiples of a uniform item size. The month and week tracks are a `Scroll` with `views/track-window.ts` instead, which also keeps item math exact for snapping and hit tests.
- A view's position comes from `measure()`; day hit testing is `lib/day-hits.ts`, fed by each view from its scroll offsets. Mouse drags go to responders, finger drags to the scroll views around them, so `app.drag` headless only reaches a responder across a scroll view's axis.
- A view with `onWheel` takes every wheel over it from the scroll views around it, touchpad gestures too, with raw deltas and no momentum. The month uses it to land on weeks (`views/month/wheel-snap.ts`). An `Overlay` hears Escape along with the dialog above it.
- Settings is a `<Window kind="dialog">` (`components/settings/SettingsWindow.tsx`), rendered from the app's one engine: it reads the same stores, with no syncing between windows. Escape goes to its own dialogs first, then closes it. `currentWindow()` only works while rendering; `focusedWindow()` says which window has the keys (`settingsFocused` keeps the calendar's keys out of Settings). Headless tests run as iOS unless `open` names a desktop `platform`, and `<Window>` renders nothing off desktops.
- A signal made in a component throws `not a live signal` once the component has gone: after `await`, never write one past `onClose()`. No `finally { saving.set(false) }` in a dialog.
- No `capabilities` key doesn't mean `fs`: `fs/promises` refuses every path until `capabilities.fs` grants it, and declaring the key limits everything else. The backend reads files; `Backend.pickPath` shows the system's file dialog. `Picker.pickFiles` gives a file's bytes but no path, and picks no folders, so it doesn't replace it.
- On desktops Tab stops at every enabled `Input`, ignoring `focusable={false}`: keep a hidden or inert field out with `disabled`. A ref's `focus()` still works on it there.
- Only `Input` reports keys, without modifiers. To capture a keystroke, bind them all (`components/settings/shortcuts/key-capture.ts`).
- `style={{ display: "flex" }}` makes a view a row, like the `flex` class: write `flex-col` too.
- `Command`'s `renderItem` content sits in a host a `flex-row` item would shrink to fit: keep `itemClass` a column (`components/ui/command.tsx` does).
- `keymap` consumes every key it fires for, whatever the handler does, and `passThrough` lets every press go on as well, so neither makes a key conditional. A key whose command won't run must not be bound: `GlobalShortcuts` rebinds as the app's state changes.
- `List` matches rows by identity, so rows must keep their objects across reloads (`keepUnchangedRows` in `lib/agenda.ts`). `scrollToIndex` goes by the sizes it has: scroll again once the rows are measured.
- `rencal` (`native/src/bin/rencal`) is a binary of its own: `cargo build --release --bin rencal` in `native/`, shipped next to the packaged `renCal`, which it starts for anything that isn't its own subcommand.
- `tsconfig.json` must keep its `include` and restate NSH's `paths`; without them `nsh check` silently checks nothing.
- Tests import from `@/lib/testing/vitest`.
