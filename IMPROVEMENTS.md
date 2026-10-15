# View plugin improvements

Follow-ups from a review of the `view-plugins` branch. The internal registry refactor is in good shape; most of these are about the public contract (`@rencal/plugin-api` and the manifest), which gets expensive to change once third-party plugins depend on it.

## Before third-party plugins build on the API

### 1. Stop leaking internal types through the API

The generated `packages/plugin-api/index.d.ts` exposes the raw RPC event shape (`RpcEventTime`, `calendar_slug`, `recurring_event_id`, `updated`) and the internal `EventDateInfo` projection (`startMs`, `firstDay`, `lastDay`, …). Any RPC or event-time refactor would then break plugins.

- Define a curated plugin event type in `src/plugin-api/` with only the fields a view needs.
- Convert to it at the API boundary instead of re-exporting `CalendarEvent` from `@/lib/cal-events`.

### 2. Drop `useEvents()`

`useEvents()` returns whatever range the core views happened to load, which the plugin plan explicitly ruled out in favour of range-based access.

- Remove it from `src/plugin-api/index.ts`.
- Move `rencal-view-board` to `useEventsInRange(yesterday, endOfWeek + 1)`.
- Keep `useEventsInRange`'s signature; it can move to a selector-based events store later without an API change.

### 3. Add API versioning

The manifest only has `min_rencal_version`. Renaming a hook makes old plugins fail at load time with a missing-export error inside the error boundary: graceful, but the app can't refuse or flag incompatible plugins up front.

- Add `api_version` to the manifest (as in the plugin plan) and validate it in `src-tauri/plugin-contract`.
- Skip or flag plugins whose major doesn't match, before loading their script.

### 4. Stop the loaded event range from growing forever

`ensureRangeLoaded` widens one contiguous range and never shrinks it. Paging from 2026 back to 2020 in year view loads about seven years of events, and every `events-changed` (the bar widget's `caldir pull` fires one every 5 minutes) then refetches all of it. Month's infinite scroll already does this, but year view and plugins asking for arbitrary ranges make it much worse.

- Move events into a store with range selectors (the plugin plan's "events store" item), so `useEventsInRange` only subscribes to what it shows.
- Let the loaded range shrink, or track disjoint ranges, so a far jump doesn't pull in everything in between.

### 5. Keep plugin CSS off `:root`

The board template imports `tailwindcss/theme.css` normally, so `board.css` sets `--spacing`, `--font-weight-medium` and `--tracking-wide` on `:root` for the whole app. The values match today, but a plugin built with a different Tailwind version or its own `@theme` would restyle renCal. Plugins will copy the template, so fix it there first.

- Import Tailwind's theme as reference only (`theme(reference)`) so nothing is emitted on `:root`.
- Document in `src-tauri/src/plugins/README.md` that plugin CSS must be layered and that utility classes are global.

### 6. Say that plugins run code

The indexer already tags view plugins (`ContributionKind::View`), so they appear in the catalog as soon as this merges. A view runs arbitrary JS with full app access, and can install from a default branch. Settings → Plugins says nothing about this, for providers either; the plugin plan says it should state plainly that community plugins can do anything the app can.

### 7. Reconcile the entry shape with the plan

The plan has `definePlugin({ activate(ctx) })`; the branch uses one script per view that default-exports a component. The per-view model is simpler and lazy-loads for free, and is worth keeping, but it needs an answer for:

- per-plugin context: settings, storage and `deactivate`;
- a plugin opening its own view, since it doesn't know its namespaced `<plugin-id>/<view-id>`;
- how `contributes.commands` will attach a `run` function.

Update `Plugin system plan.md` to match whatever is decided.

## Smaller things

- `goToDate` is typed `=> undefined` in the public `.d.ts` because it's a `void` expression arrow. Give it a block body so it reads as `void`.
- `scripts/build-plugin-api.mjs` extracts the Tailwind token blocks from `global.css` by counting braces, which breaks on a `{` inside a comment or string. Low priority: CI diffs the output.
- Stop sending full scripts in the views snapshot. `ExternalView` carries up to 2 MiB per view, resent on every plugins-directory and theme change. Put a content hash in the snapshot and fetch the script when the view first renders, or serve files on the `rencal-plugin://` scheme from the plugin plan. This doesn't change the contract (one ESM file importing only shared modules), so it can happen any time. Meanwhile, append `//# sourceURL=rencal-plugin/<id>.js` to each script for readable stack traces.
- Board is now an external plugin. Users whose stored view was `"board"` silently land on month after upgrading; decide whether that needs a notice. Also confirm whether year ships as a core view.
- View plugins install committed `dist/` from the default branch, pinned by commit in the lock file. The plugin plan expects tagged releases; pick one for the long term.
- Each plugins-directory change scans every package twice (once for themes, once for views). Share one scan between the two snapshots.
